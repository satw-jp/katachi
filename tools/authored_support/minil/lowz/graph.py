"""Direct target-side brace intervals and upstream-root accounting."""
def unbraced_intervals(bottom, top, target_side_contacts):
    cursor=bottom;gaps=[]
    for lo,hi in sorted(target_side_contacts):
        lo=max(bottom,lo);hi=min(top,hi)
        if hi<bottom or lo>top:continue
        if lo>cursor:gaps.append([cursor,lo])
        cursor=max(cursor,hi)
    if cursor<top:gaps.append([cursor,top])
    return gaps

def independent_roots(paths):
    selected=[]
    for p in sorted(paths,key=lambda x:tuple(sorted(x))):
        roots=set(p)
        if roots and all(not roots.intersection(q) for q in selected):selected.append(roots)
    return len(selected)
