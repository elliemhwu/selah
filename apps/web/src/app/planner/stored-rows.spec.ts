import type { PlannerData } from '@selah/planner-core';
import { type DeviceSnapshot, EMPTY_SNAPSHOT } from '../data/device-storage';

// The device keeps planner rows in the API's row shapes; planner-core reads them as they are.
describe('planner rows on the device', () => {
  it('are the rows planner-core works on', () => {
    const snapshot: DeviceSnapshot = EMPTY_SNAPSHOT;
    const data: PlannerData = snapshot;
    expect(data.tasks).toEqual([]);
  });
});
