import { shouldAutoAdvanceTimeInput } from '../../src/ui/TimeInputNavigation';

function createInputEvent(inputType: string): Event {
  return Object.assign(new Event('input'), { inputType });
}

describe('shouldAutoAdvanceTimeInput', () => {
  it.each<[string, Event, number, number, boolean]>([
    ['completed insertion advances', createInputEvent('insertText'), 2, 2, true],
    ['backward deletion stays in place', createInputEvent('deleteContentBackward'), 2, 2, false],
    ['incomplete insertion stays in place', createInputEvent('insertText'), 1, 2, false],
    ['generic completed event advances', new Event('input'), 2, 2, true]
  ])('%s', (_name, event, valueLength, maxLength, expected) => {
    expect(shouldAutoAdvanceTimeInput(event, valueLength, maxLength)).toBe(expected);
  });
});
