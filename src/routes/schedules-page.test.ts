import { h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/vue';
import { render, routerFixture } from '@/test/render';
import SchedulesPage from './schedules-page.vue';

const owner='aB3xZ9kQ';
const scene={id:'scene-1',owner_id:owner,name:'Morning departures',
  data_source_id:'source-1',visualization:'departures-list'};
describe('Schedules page',()=>{
  const fetchMock=vi.fn<typeof fetch>();
  let saved:Record<string,unknown>|null=null;
  beforeEach(()=>{
    window.localStorage.clear();
    saved=null;
    fetchMock.mockImplementation(async (input,init)=>{
      const path=String(input);
      if(path.startsWith('/api/schedules?'))return Response.json({schedules:[]});
      if(path.startsWith('/api/scenes?'))return Response.json({scenes:[scene]});
      if(path==='/api/schedules' && init?.method==='POST'){
        saved=JSON.parse(String(init.body)) as Record<string,unknown>;
        return Response.json({schedule:{id:'schedule-1',...saved,rules:(saved.rules as Array<unknown>).map((rule)=>({id:'rule-1',...rule as object}))}},{status:201});
      }
      throw new Error('Unexpected request '+path);
    });
    vi.stubGlobal('fetch',fetchMock);
  });
  afterEach(()=>{vi.unstubAllGlobals();fetchMock.mockReset();});
  it('shows immutable Off fallback and saves only scene windows',async()=>{
    await render(routerFixture(['/schedules?owner='+owner],[[
      {path:'/schedules',element:h(SchedulesPage),children:[]},
    ]]));
    expect(await screen.findByText('Off is always the default')).toBeInTheDocument();
    await screen.findByRole('button',{name:/add time window/i});
    await fireEvent.input(screen.getByLabelText('Schedule name'),{target:{value:'Weekday commute'}});
    await fireEvent.click(screen.getByRole('button',{name:/add time window/i}));
    expect(screen.getByText('Off at all other times.')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button',{name:'Create schedule'}));
    await waitFor(()=>expect(saved).not.toBeNull());
    expect(saved).toMatchObject({
      owner_id:owner,name:'Weekday commute',timezone:'Europe/Stockholm',
      rules:[{days:[0,1,2,3,4],start_time:'07:00',end_time:'09:00',scene_id:scene.id}],
    });
    expect(Object.keys(saved!)).not.toContain('default');
    expect(Object.keys(saved!)).not.toContain('default_scene_id');
  });
});
