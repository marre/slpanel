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

export interface PresentationRecord {
  id: string;
  owner_id: string;
  name: string;
  data_source_id: string;
  visualization: VisualizationType;
}

export type PresentationInput = Omit<PresentationRecord, 'id'>;

export type SelectionMode = 'presentation' | 'off';

export interface ManualSelection {
  mode: SelectionMode;
  presentation_id: string | null;
  until: string | null;
}

export interface ScheduleRule {
  id: string;
  days: number[]; // 0=Monday ... 6=Sunday
  start_time: string; // HH:mm in the display's timezone
  end_time: string; // exclusive; overnight ranges are supported
  mode: SelectionMode;
  presentation_id: string | null;
}

export type ScheduleRuleInput = Omit<ScheduleRule, 'id'>;

export interface PanelControl {
  display_id: string;
  timezone: string;
  default_presentation_id: string | null;
  manual: ManualSelection | null;
  rules: ScheduleRule[];
}

export type PanelControlInput = Pick<
  PanelControl,
  'timezone' | 'default_presentation_id' | 'manual'
> & { rules: ScheduleRuleInput[] };

export interface EffectivePresentation {
  mode: SelectionMode | 'legacy';
  reason: 'manual' | 'schedule' | 'default' | 'legacy';
  presentation: PresentationRecord | null;
  data_source: DataSourceRecord | null;
  next_transition_at: string | null;
}
