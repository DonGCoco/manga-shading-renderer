#version 410

uniform sampler2D diffuse_texture;
uniform sampler2D specular_texture;
uniform sampler2D light_d_texture;
uniform sampler2D light_s_texture;

// --- added for outline + manga mode ---
uniform sampler2D normal_gbuffer;   // GBufferWorldSpaceNormal (encoded in [0,1])
uniform sampler2D depth_gbuffer;    // DepthBuffer (0..1)

// outline controls
uniform int   enable_outline;              // 0/1
uniform int shading_mode;   // 0 = Phong, 1 = Toon
uniform float outline_depth_threshold;      
uniform float outline_normal_threshold;     
uniform float outline_strength;             

// output controls
uniform int output_mode;            
uniform int manga_grey_levels;      

layout (pixel_center_integer) in vec4 gl_FragCoord;
out vec4 frag_color;

float luma(vec3 c)
{
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float grey_quantize(float g, int levels)
{
    levels = max(levels, 2);
    g = clamp(g, 0.0, 1.0);
    return floor(g * float(levels)) / float(levels);
}

void main()
{
    ivec2 pixel_coord = ivec2(gl_FragCoord.xy);
    ivec2 size = textureSize(diffuse_texture, 0);

    // --- fetch base deferred result (same as your original) ---
    vec3 diffuse  = texelFetch(diffuse_texture,  pixel_coord, 0).rgb;
    vec3 specular = texelFetch(specular_texture, pixel_coord, 0).rgb;

	if (shading_mode == 1) {
    ivec2 size = textureSize(diffuse_texture, 0);
    ivec2 c = clamp(pixel_coord, ivec2(0), size - ivec2(1));
    ivec2 px = ivec2(1, 0);
    ivec2 py = ivec2(0, 1);

    diffuse =
        texelFetch(diffuse_texture, c, 0).rgb * 0.4 +
        texelFetch(diffuse_texture, clamp(c + px, ivec2(0), size - ivec2(1)), 0).rgb * 0.15 +
        texelFetch(diffuse_texture, clamp(c - px, ivec2(0), size - ivec2(1)), 0).rgb * 0.15 +
        texelFetch(diffuse_texture, clamp(c + py, ivec2(0), size - ivec2(1)), 0).rgb * 0.15 +
        texelFetch(diffuse_texture, clamp(c - py, ivec2(0), size - ivec2(1)), 0).rgb * 0.15;
}



    vec3 light_d  = texelFetch(light_d_texture,  pixel_coord, 0).rgb;
    vec3 light_s  = texelFetch(light_s_texture,  pixel_coord, 0).rgb;

    vec3 ambient = vec3(0.15);
if (shading_mode == 1) {
    ambient = vec3(0.03);
}

    vec3 color = (ambient + light_d) * diffuse + light_s * specular;

    // --- optional manga mode: quantized grayscale ---
    if (output_mode == 1) {
        float g = luma(color);
        g = grey_quantize(g, manga_grey_levels);
        color = vec3(g);
    }

    // --- optional screen-space outline (depth + normal discontinuities) ---
    if (enable_outline != 0) {
        // Clamp neighbor coords to avoid out-of-bounds
        ivec2 px = ivec2(1, 0);
        ivec2 py = ivec2(0, 1);

        ivec2 c  = clamp(pixel_coord,             ivec2(0), size - ivec2(1));
        ivec2 cx = clamp(pixel_coord + px,        ivec2(0), size - ivec2(1));
        ivec2 cX = clamp(pixel_coord - px,        ivec2(0), size - ivec2(1));
        ivec2 cy = clamp(pixel_coord + py,        ivec2(0), size - ivec2(1));
        ivec2 cY = clamp(pixel_coord - py,        ivec2(0), size - ivec2(1));

        float d0 = texelFetch(depth_gbuffer, c,  0).r;
        float d1 = texelFetch(depth_gbuffer, cx, 0).r;
        float d2 = texelFetch(depth_gbuffer, cX, 0).r;
        float d3 = texelFetch(depth_gbuffer, cy, 0).r;
        float d4 = texelFetch(depth_gbuffer, cY, 0).r;

        vec3 n0 = texelFetch(normal_gbuffer, c,  0).xyz * 2.0 - 1.0;
        vec3 n1 = texelFetch(normal_gbuffer, cx, 0).xyz * 2.0 - 1.0;
        vec3 n2 = texelFetch(normal_gbuffer, cX, 0).xyz * 2.0 - 1.0;
        vec3 n3 = texelFetch(normal_gbuffer, cy, 0).xyz * 2.0 - 1.0;
        vec3 n4 = texelFetch(normal_gbuffer, cY, 0).xyz * 2.0 - 1.0;

        float depth_edge  = max(max(abs(d0 - d1), abs(d0 - d2)), max(abs(d0 - d3), abs(d0 - d4)));
        float normal_edge = max(max(length(n0 - n1), length(n0 - n2)), max(length(n0 - n3), length(n0 - n4)));

        float e_depth  = smoothstep(outline_depth_threshold,  outline_depth_threshold * 2.0,  depth_edge);
        float e_normal = smoothstep(outline_normal_threshold, outline_normal_threshold * 2.0, normal_edge);

        float edge = clamp(e_depth + e_normal, 0.0, 1.0);

        // Darken along edges
        color = mix(color, vec3(0.0), clamp(edge * outline_strength, 0.0, 1.0));
    }

    frag_color = vec4(color, 1.0);
}
