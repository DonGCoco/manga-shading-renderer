#version 410

// -----------------------------------------------------------------------------
// Material texture availability flags
// -----------------------------------------------------------------------------
uniform bool has_diffuse_texture;
uniform bool has_specular_texture;
uniform bool has_normals_texture;    // Tangent-space normal map present
uniform bool has_opacity_texture;

// -----------------------------------------------------------------------------
// Material textures
// -----------------------------------------------------------------------------
uniform sampler2D diffuse_texture;
uniform sampler2D specular_texture;
uniform sampler2D normals_texture;   // Tangent-space normal map
uniform sampler2D opacity_texture;

// Transform for normals when no normal map is used
uniform mat4 normal_model_to_world;

// -----------------------------------------------------------------------------
// Interpolated vertex data
// -----------------------------------------------------------------------------
in VS_OUT {
    vec3 normal;
    vec2 texcoord;
    vec3 tangent;
    vec3 binormal;
} fs_in;

// -----------------------------------------------------------------------------
// G-buffer outputs
// -----------------------------------------------------------------------------
layout (location = 0) out vec4 geometry_diffuse;
layout (location = 1) out vec4 geometry_specular;
layout (location = 2) out vec4 geometry_normal;

void main()
{
    // -------------------------------------------------------------------------
    // Alpha test: discard fully transparent fragments
    // -------------------------------------------------------------------------
    if (has_opacity_texture &&
        texture(opacity_texture, fs_in.texcoord).r < 1.0)
    {
        discard;
    }

    // -------------------------------------------------------------------------
    // Diffuse albedo
    // -------------------------------------------------------------------------
    geometry_diffuse = vec4(0.0);
    if (has_diffuse_texture) {
        geometry_diffuse = texture(diffuse_texture, fs_in.texcoord);
    }

    // -------------------------------------------------------------------------
    // Specular color
    // -------------------------------------------------------------------------
    geometry_specular = vec4(0.0);
    if (has_specular_texture) {
        geometry_specular = texture(specular_texture, fs_in.texcoord);
    }

    // -------------------------------------------------------------------------
    // World-space normal
    // -------------------------------------------------------------------------
    vec3 N_world;

    if (has_normals_texture) {
        // Decode tangent-space normal from normal map
        vec3 N_tangent = texture(normals_texture, fs_in.texcoord).xyz;
        N_tangent = N_tangent * 2.0 - 1.0;

        // Construct TBN matrix (columns: tangent, bitangent, normal)
        mat3 TBN = mat3(fs_in.tangent, fs_in.binormal, fs_in.normal);

        // Transform normal to world space
        N_world = normalize(TBN * N_tangent);
    } else {
        // Fallback: use interpolated vertex normal
        mat3 normal_to_world = mat3(normal_model_to_world);
        N_world = normalize(normal_to_world * fs_in.normal);
    }

    // Encode normal from [-1,1] to [0,1] for G-buffer storage
    geometry_normal = vec4(N_world * 0.5 + 0.5, 1.0);
}
