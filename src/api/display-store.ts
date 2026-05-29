import type {
  CreateDisplayInput,
  DisplayRecord,
  UpdateDisplayInput,
} from './types';

export interface DisplayStore {
  listByOwner(ownerId: string): Promise<DisplayRecord[]>;
  getById(id: string): Promise<DisplayRecord | null>;
  create(input: CreateDisplayInput): Promise<DisplayRecord>;
  update(id: string, input: UpdateDisplayInput): Promise<DisplayRecord | null>;
  delete(id: string): Promise<boolean>;
}
