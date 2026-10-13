"""Exact source V8 topology normalization, in memory; no STL export."""

def diagnose(id, arrays, np):
    tri=arrays['vertices'][arrays['faces']].astype(np.float32)
    xyz=tri.astype(float)
    tri=tri[np.linalg.norm(np.cross(xyz[:,1]-xyz[:,0],xyz[:,2]-xyz[:,0]),axis=1)>0]
    points,inv=np.unique(tri.reshape(-1,3),axis=0,return_inverse=True)
    faces=inv.reshape(-1,3)
    edges=np.sort(np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]]),axis=1)
    unique,counts=np.unique(edges,axis=0,return_counts=True);bad=counts!=2
    if not np.any(bad):return None
    return dict(id=id,role='REMOVABLE_SUPPORT',bad_edges=int(np.sum(bad)),open_edges=int(np.sum(counts==1)),nonmanifold_edges=int(np.sum(counts>2)),edge_coords=points[unique[bad]].tolist(),edge_counts=counts[bad].tolist())
def normalize(arrays, issue, kernel):
    np = kernel.np
    md = kernel.md
    man = kernel.man
    id = issue['id']
    q = arrays
    old = man(q['vertices'], q['faces'])
    v, inv = np.unique(q['vertices'], axis=0, return_inverse=True)
    f = inv[q['faces']]
    t = v[f].astype(float)
    keep = np.linalg.norm(np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]), axis=1) > 0
    f = f[keep]
    steps = []
    if issue['nonmanifold_edges']:
        sortedf = np.sort(f, axis=1)
        uf, invf, counts = np.unique(sortedf, axis=0, return_inverse=True, return_counts=True)
        remove = []
        for face in np.where(counts > 1)[0]:
            ids = np.where(invf == face)[0]
            assert len(ids) == 2
            a, b = v[f[ids]].astype(float)
            na = np.cross(a[1] - a[0], a[2] - a[0])
            nb = np.cross(b[1] - b[0], b[2] - b[0])
            assert np.allclose(na, -nb, atol=1e-15)
            width = float(min((np.linalg.norm(a[i] - a[j]) for i, j in [(0, 1), (1, 2), (2, 0)])))
            assert width < 2e-07
            steps.append(dict(operation='Remove opposite coincident zero-volume sliver face pair', maximum_surface_set_change_bound_mm=width, vertices_unchanged=True))
            remove.extend(ids.tolist())
        f = np.delete(f, remove, axis=0)
    else:
        edges = np.sort(np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]]), axis=1)
        ue, counts = np.unique(edges, axis=0, return_counts=True)
        boundary = ue[counts == 1]
        ids = np.unique(boundary)
        assert len(ids) == 3
        lengths = np.linalg.norm(v[boundary[:, 0]] - v[boundary[:, 1]], axis=1)
        a, c = boundary[np.argmax(lengths)]
        b = int(next((x for x in ids if x not in [a, c])))
        assert np.linalg.norm(np.cross((v[b] - v[a]).astype(float), (v[c] - v[a]).astype(float))) == 0
        facei = np.where(np.any(f == a, axis=1) & np.any(f == c, axis=1))[0]
        assert len(facei) == 1
        tri = f[facei[0]]
        ia = int(np.where(tri == a)[0][0])
        ic = int(np.where(tri == c)[0][0])
        if (ia + 1) % 3 != ic:
            a, c = (c, a)
            ia, ic = (ic, ia)
        other = int(next((x for x in tri if x not in [a, c])))
        f = np.concatenate([np.delete(f, facei, axis=0), np.array([[a, b, other], [b, c, other]])])
        steps.append(dict(operation='Split triangle long edge at existing exactly-collinear T-junction vertex', maximum_surface_set_change_bound_mm=0.0, vertices_unchanged=True, split_span_mm=float(lengths.max())))
    edges = np.sort(np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]]), axis=1)
    _, counts = np.unique(edges, axis=0, return_counts=True)
    assert np.all(counts == 2), (id, counts[counts != 2])
    new = man(v, f)
    assert new.status() == md.Error.NoError
    xor = float((old - new).volume() + (new - old).volume())
    assert abs(xor) < 1e-06, (id, xor)
    return (v.astype(np.float32), f.astype(np.uint32), steps, xor)
