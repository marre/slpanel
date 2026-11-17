export type VisualizationType = 'departures-list';

export interface DataSourceRecord {
  id: string;
  owner_id: string;
  name: string;
  site_id: string | null;
  site_name: string | null;
  refresh_interval: number;
  line_numbers: string[];
  directions: string[];
  modes: string[];
}
export type DataSourceInput = Omit<DataSourceRecord, 'id'>;

export interface SceneRecord {
  id: string;
  owner_id: string;
  name: string;
  data_source_id: string;
  visualization: VisualizationType;
}
export type SceneInput = Omit<SceneRecord, 'id'>;

// ISO weekday convention: 0=Monday, ..., 6=Sunday. Times are local, end-exclusive.
export interface ScheduleRuleInput {
  days: number[];
  start_time: string;
  end_time: string;
  scene_id: string;
}
export interface ScheduleRule extends ScheduleRuleInput { id: string }
export interface ScheduleRecord {
  id: string;
  owner_id: string;
  name: string;
  timezone: string;
  rules: ScheduleRule[];
}
export type ScheduleInput = Omit<ScheduleRecord, 'id' | 'rules'> & {
  rules: ScheduleRuleInput[];
};

// Device = existing physical 'display', with stable display_id in USB firmware.
export interface DeviceAssignment {
  display_id: string;
  kind: 'scene' | 'schedule';
  scene_id: string | null;
  schedule_id: string | null;
}
export type DeviceAssignmentInput = Omit<DeviceAssignment, 'display_id'>;

export interface EffectiveScene {
  mode: 'scene' | 'off' | 'legacy';
  reason: 'direct' | 'schedule' | 'unassigned';
  scene: SceneRecord | null;
  data_source: DataSourceRecord | null;
  schedule_id: string | null;
  next_transition_at: string | null;
}
