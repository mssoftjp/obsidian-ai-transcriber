import { ResourceManager } from '../../../src/core/resources/ResourceManager';

describe('ResourceManager abort cleanup', () => {
	afterEach(async () => {
		await ResourceManager.getInstance().cleanupAll();
	});

	it('aborts a live controller before running cleanup handlers', () => {
		const manager = ResourceManager.getInstance();
		const controller = manager.getAbortController('test-operation');
		const observedStates: boolean[] = [];
		manager.registerCleanupHandler('test-operation', () => {
			observedStates.push(controller.signal.aborted);
		});

		manager.cleanupAbortController('test-operation');

		expect(controller.signal.aborted).toBe(true);
		expect(observedStates).toEqual([true]);
		expect(manager.hasResource('test-operation')).toBe(false);
	});
});
