import json,pathlib,time,unittest,sys
sys.path.append(r'J:\My Drive\codex\2026-09-05\files-mentioned-by-the-user-samples\work\r2\vendor')
import networkx as nx
from route_analysis import analyze,impact,snapshot

def graph(paths,branch_overrides=None):
    g=nx.Graph();branch_overrides=branch_overrides or {}
    for path in paths:
        for n in path:
            g.add_node(n,branch_id=branch_overrides.get(n,n if n not in ('T','BASE','J') else None))
        for a,b in zip(path,path[1:]):g.add_edge(a,b,evidence='GEOMETRY_CONTACT_VERIFIED',joint_id=':'.join(sorted((a,b))))
    return g

class Focused(unittest.TestCase):
    def count(self,g):return analyze(g,'T',['BASE'],True)['graph_count']
    def test_three_upper_branches_common_trunk(self):
        g=graph([['T',x,'TRUNK','BASE'] for x in ['A','B','C']])
        r=analyze(g,'T',['BASE'],True);self.assertEqual(r['graph_count'],1);self.assertIn('TRUNK',r['common_branch_failures'])
    def test_independent_branches_common_joint(self):
        g=graph([['T','A','J','C','BASE'],['T','B','J','D','BASE']]);g.nodes['J']['joint_id']='COMMON'
        r=analyze(g,'T',['BASE'],True);self.assertEqual(r['graph_count'],2);self.assertIn('COMMON',r['common_joint_failures'])
    def test_delayed_second_route(self):
        nodes=[{'id':n,'branch_id':n if n in 'AB' else None} for n in ['T','A','B','BASE']]
        edges=[{'a':'T','b':b,'onset_z':z} for b,z in [('A',0),('B',5)]]+[{'a':b,'b':'BASE'} for b in 'AB']
        self.assertEqual(self.count(snapshot(nodes,edges,4,'PRINTING_WITH_SUPPORT')),1)
        self.assertEqual(self.count(snapshot(nodes,edges,5,'PRINTING_WITH_SUPPORT')),2)
    def test_same_layer_late_command(self):
        nodes=[{'id':n,'branch_id':n if n in 'AB' else None} for n in ['T','A','B','BASE']]
        edges=[{'a':'T','b':'A'},{'a':'A','b':'BASE'},{'a':'T','b':'B'},{'a':'B','b':'BASE','command_line':100}]
        self.assertEqual(self.count(snapshot(nodes,edges,5,'PRINTING_WITH_SUPPORT',99)),1)
        self.assertEqual(self.count(snapshot(nodes,edges,5,'PRINTING_WITH_SUPPORT',100)),2)
    def test_support_mode_difference(self):
        nodes=[{'id':n,'branch_id':n if n in 'AS' else None,'role':'SUPPORT' if n=='S' else 'PERMANENT'} for n in ['T','A','S','BASE']]
        edges=[{'a':a,'b':b,'contact_kind':'BEARING_CONTACT' if 'S' in (a,b) else 'FUSED_CONTACT'} for a,b in [('T','A'),('A','BASE'),('T','S'),('S','BASE')]]
        self.assertEqual(self.count(snapshot(nodes,edges,10,'PRINTING_WITH_SUPPORT')),2)
        self.assertTrue(any(w['bearing_assumption'] for w in analyze(snapshot(nodes,edges,10,'PRINTING_WITH_SUPPORT'),'T',['BASE'])['witnesses']))
        self.assertEqual(self.count(snapshot(nodes,edges,10,'PERMANENT_ONLY_AFTER_REMOVAL')),1)
    def test_crossing_not_a_connection(self):
        nodes=[{'id':n,'branch_id':n if n in 'AB' else None} for n in ['T','A','B','BASE']]
        edges=[{'a':'T','b':'A'},{'a':'B','b':'BASE'},{'a':'A','b':'B','evidence':'UNRESOLVED'}]
        self.assertEqual(self.count(snapshot(nodes,edges,10,'PRINTING_WITH_SUPPORT')),0)
        edges[-1]['evidence']='GEOMETRY_CONTACT_VERIFIED'
        self.assertEqual(self.count(snapshot(nodes,edges,10,'PRINTING_WITH_SUPPORT')),1)
    def test_crop_boundary_is_not_base(self):
        g=graph([['T','A','CROP']]);self.assertEqual(analyze(g,'T',['BASE'],True)['graph_count'],0)
    def test_split_noop_reload_invariance(self):
        a=graph([['T','A','BASE']]);b=graph([['T','A1','A2','BASE']],{'A1':'A','A2':'A'})
        self.assertEqual(self.count(a),self.count(b))
        copied=nx.node_link_graph(json.loads(json.dumps(nx.node_link_data(b,edges='links'))),edges='links')
        self.assertEqual(self.count(b),self.count(copied))
    def test_same_id_fragments_do_not_connect(self):
        g=graph([['T','A1'],['A2','BASE']],{'A1':'A','A2':'A'})
        self.assertEqual(self.count(g),0)
    def test_parallel_same_id_not_two_branches(self):
        g=graph([['T','A1','BASE'],['T','A2','BASE']],{'A1':'A','A2':'A'})
        self.assertEqual(self.count(g),1)
    def test_impact_sets_unique_and_partial(self):
        g=graph([['T','A','TRUNK','BASE'],['PART2','BASE']])
        g.nodes['T']['flower_ids']=['F1','F1'];g.nodes['A']['flower_ids']=['F1','F2']
        g.nodes['A']['branch_id']='PART';g.nodes['PART2']['branch_id']='PART'
        g.nodes['A']['bbox']=[[0,1,2],[3,4,5]]
        r=impact(g,['BASE'],'branch','TRUNK')
        self.assertEqual(r['lost_flower_ids'],['F1','F2']);self.assertEqual(r['partially_disconnected_branch_ids'],['PART'])
        self.assertEqual(r['bbox'],[[0,1,2],[3,4,5]])
        g.nodes['PART2']['flower_ids']=['F1']
        r=impact(g,['BASE'],'branch','TRUNK')
        self.assertEqual(r['lost_flower_ids'],['F2']);self.assertEqual(r['partially_disconnected_flower_ids'],['F1'])
        self.assertTrue(r['failure_present_in_graph'])
        absent=impact(g,['BASE'],'branch','NOT_PRESENT')
        self.assertFalse(absent['failure_present_in_graph'])
        self.assertEqual(absent['failure_status'],'SELECTED_FAILURE_NOT_PRESENT_AT_HEIGHT')
    def test_declared_count_does_not_claim_complete_contacts(self):
        r=analyze(graph([['T','A','BASE']]),'T',['BASE'])
        self.assertEqual(r['graph_count'],1);self.assertEqual(r['color'],'GRAY')
    def test_target_joint_is_not_immune(self):
        g=graph([['T','A','BASE'],['T','B','BASE']]);g.nodes['T']['joint_id']='TARGET'
        self.assertIn('TARGET',analyze(g,'T',['BASE'],True)['common_joint_failures'])
    def test_base_branch_has_unit_capacity(self):
        g=graph([['T','A','ROOT','BASE'],['T','B','ROOT','BASE']])
        self.assertEqual(self.count(g),1)
    def test_base_selection_does_not_invent_three_routes(self):
        g=graph([['T','A','BASE']])
        self.assertIsNone(analyze(g,'BASE',['BASE'],True)['graph_count'])

if __name__=='__main__':
    t=time.perf_counter();suite=unittest.defaultTestLoader.loadTestsFromTestCase(Focused)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    p=pathlib.Path(__file__).resolve().parents[2]/'outputs/ROUTE_ENGINE_TEST_RESULTS.json'
    p.write_text(json.dumps({'scope':'Synthetic graph fixtures only; not real graph assembly, STALE UI, geometry, Blender or physical acceptance.','tests_run':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'pass':result.wasSuccessful(),'elapsed_s':time.perf_counter()-t},indent=2))
    sys.exit(not result.wasSuccessful())
