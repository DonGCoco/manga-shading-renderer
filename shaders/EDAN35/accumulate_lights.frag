#version 410

// -----------------------------------------------------------------------------
// View-projection matrices for camera and lights
// - camera.view_projection_inverse : reconstruct world-space position
// - lights[i].view_projection      : project world-space position into light space
// -----------------------------------------------------------------------------
struct ViewProjTransforms
{
    mat4 view_projection;
    mat4 view_projection_inverse;
};

layout (std140) uniform CameraViewProjTransforms
{
    ViewProjTransforms camera;
};

layout (std140) uniform LightViewProjTransforms
{
    ViewProjTransforms lights[4];
};

// Index of the currently processed light (set per-light in C++)
uniform int light_index;

// -----------------------------------------------------------------------------
// G-buffer and shadow map inputs
// -----------------------------------------------------------------------------
uniform sampler2D depth_texture;     // Camera-space depth buffer
uniform sampler2D normal_texture;    // World-space normals encoded in [0,1]
uniform sampler2D shadow_texture;    // Shadow map for current light

uniform vec2 inverse_screen_resolution; // 1 / screen resolution
uniform vec3 camera_position;            // World-space camera position

// Light parameters (current light)
uniform vec3 light_color;
uniform vec3 light_position;
uniform vec3 light_direction;
uniform float light_intensity;
uniform float light_angle_falloff;

// Shading control
uniform int shading_mode;            // 0 = Phong, 1 = Toon
uniform int diffuse_bands;            // Number of diffuse quantisation bands
uniform int specular_bands;           // Reserved (not used here)
uniform float specular_threshold;     // Threshold for hard specular highlight
uniform float specular_shininess;     // Phong shininess exponent
uniform float band_softness;          // Softness of toon band transitions

// -----------------------------------------------------------------------------
// Outputs to light accumulation buffer
// -----------------------------------------------------------------------------
layout (location = 0) out vec4 light_diffuse_contribution;
layout (location = 1) out vec4 light_specular_contribution;

// -----------------------------------------------------------------------------
// Soft quantisation helper for toon shading
// -----------------------------------------------------------------------------
float quantize_soft(float x, int bands, float softness)
{
    x = clamp(x, 0.0, 1.0);
    float t = x * float(bands);
    float base = floor(t) / float(bands);
    float frac = fract(t);
    float s = smoothstep(0.5 - softness, 0.5 + softness, frac);
    return base + s / float(bands);
}

void main()
{
    // Texel size of the shadow map (used for PCF offsets)
    vec2 shadowmap_texel_size = 1.0 / textureSize(shadow_texture, 0);

    // -------------------------------------------------------------------------
    // 1. Compute screen-space UV for G-buffer lookup
    // -------------------------------------------------------------------------
    vec2 texCoord = gl_FragCoord.xy * inverse_screen_resolution;

    // -------------------------------------------------------------------------
    // 2. Decode world-space normal from G-buffer
    // -------------------------------------------------------------------------
    vec3 normal = texture(normal_texture, texCoord).xyz;
    normal = normalize(normal * 2.0 - 1.0);

    // -------------------------------------------------------------------------
    // 3. Read depth value from G-buffer
    // -------------------------------------------------------------------------
    float depth = texture(depth_texture, texCoord).x;

    // -------------------------------------------------------------------------
    // 4. Reconstruct world-space position from depth
    // -------------------------------------------------------------------------
    vec4 clip_pos = vec4(texCoord * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 world_pos = camera.view_projection_inverse * clip_pos;
    world_pos /= world_pos.w;
    vec3 position = world_pos.xyz;

    // -------------------------------------------------------------------------
    // 5. Compute Blinn-Phong lighting terms (geometry only)
    // -------------------------------------------------------------------------
    vec3 L = normalize(light_position - position);
    vec3 V = normalize(camera_position - position);
    vec3 R = reflect(-L, normal);

    float ndl = max(dot(normal, L), 0.0);
    float diff_term = ndl;

    float spec_term = 0.0;
    if (ndl > 0.0) {
        float rv = max(dot(R, V), 0.0);
        spec_term = pow(rv, specular_shininess);
    }

    // Toon shading branch
    if (shading_mode == 1) {
        diff_term = quantize_soft(diff_term, diffuse_bands, band_softness);
        spec_term = (spec_term > specular_threshold) ? 1.0 : 0.0;
    }

    vec3 diffuse  = diff_term * vec3(1.0);
    vec3 specular = spec_term * vec3(1.0);

    // -------------------------------------------------------------------------
    // 6. Distance attenuation (inverse square falloff)
    // -------------------------------------------------------------------------
    float distance = length(light_position - position);
    float distance_falloff = 1.0 / (distance * distance);

    // -------------------------------------------------------------------------
    // 7. Spotlight angular attenuation
    // -------------------------------------------------------------------------
    vec3 light_dir_normalized = normalize(light_direction);
    float cos_angle = dot(-L, light_dir_normalized);
    float angle = acos(cos_angle);
    float angular_falloff = 1.0 - smoothstep(0.0, light_angle_falloff, angle);

    // -------------------------------------------------------------------------
    // 8. Transform world position into light clip space
    // -------------------------------------------------------------------------
    vec4 light_space_pos = lights[light_index].view_projection * vec4(position, 1.0);
    light_space_pos /= light_space_pos.w;

    // -------------------------------------------------------------------------
    // 9. Convert light clip space to shadow map coordinates
    // -------------------------------------------------------------------------
    vec3 shadow_coord = light_space_pos.xyz * 0.5 + 0.5;

    // Slope-scaled depth bias
    float ndl_shadow = max(dot(normal, L), 0.0);
    float bias = max(0.0001, 0.0008 * (1.0 - ndl_shadow));

    // -------------------------------------------------------------------------
    // 10. Shadow evaluation (hard for toon, PCF for Phong)
    // -------------------------------------------------------------------------
    float shadow = 0.0;

    if (shading_mode == 1) {
        // Toon: single-sample hard shadow
        float shadow_depth = texture(shadow_texture, shadow_coord.xy).x;
        shadow = (shadow_coord.z > shadow_depth + bias) ? 1.0 : 0.0;
    } else {
        // Phong: PCF soft shadow
        int pcf_samples = 2; // 5x5 kernel
        int total_samples = 0;

        for (int x = -pcf_samples; x <= pcf_samples; ++x) {
            for (int y = -pcf_samples; y <= pcf_samples; ++y) {
                vec2 offset = vec2(x, y) * shadowmap_texel_size;
                vec2 sample_coord = shadow_coord.xy + offset;

                float shadow_depth = texture(shadow_texture, sample_coord).x;
                if (shadow_coord.z > shadow_depth + bias) {
                    shadow += 1.0;
                }
                total_samples++;
            }
        }
        shadow /= float(total_samples);
    }

    // -------------------------------------------------------------------------
    // 11. Combine lighting factors
    // -------------------------------------------------------------------------
    float visibility = 1.0 - shadow;

    vec3 final_diffuse = diffuse
                       * light_color
                       * light_intensity
                       * distance_falloff
                       * angular_falloff
                       * visibility;

    vec3 final_specular = specular
                        * light_color
                        * light_intensity
                        * distance_falloff
                        * angular_falloff
                        * visibility;

    light_diffuse_contribution  = vec4(final_diffuse, 1.0);
    light_specular_contribution = vec4(final_specular, 1.0);
}
