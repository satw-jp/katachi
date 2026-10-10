import bpy
m=bpy.data.materials.new('probe');m.use_nodes=True
n=m.node_tree.nodes
for typ in ('ShaderNodeNewGeometry','ShaderNodeVectorMath','ShaderNodeMapRange','ShaderNodeMixRGB','ShaderNodeEmission','ShaderNodeOutputMaterial'):
 x=n.new(typ);print(typ, 'inputs', [s.name for s in x.inputs], 'outputs',[s.name for s in x.outputs])
 if typ=='ShaderNodeVectorMath':print('operations', [e.identifier for e in x.bl_rna.properties['operation'].enum_items])
