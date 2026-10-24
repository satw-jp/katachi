"""Shared V2 geometry construction. No new support dimensions or shapes."""
def planar_foot(k, np, xy, g):
    mesh = k.trimesh.creation.cylinder(radius=g['foot_radius'], height=g['foot_height'], sections=24)
    return k.man(mesh.vertices + np.r_[xy, g['foot_height']/2], mesh.faces)


def contact_parts(k, np, p, n, start, g):
    end = p + n*g['neck_offset']
    tip = p - n*g['neck_overlap']
    return k.capsule(start, end, g['shaft_radius']), k.capsule(end, tip, g['neck_radius']), end, tip
