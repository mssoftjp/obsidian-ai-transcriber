export function shouldAutoAdvanceTimeInput(
  event: Event,
  valueLength: number,
  maxLength: number
): boolean {
  const isBackwardDelete =
    'inputType' in event && event.inputType === 'deleteContentBackward';
  return valueLength === maxLength && !isBackwardDelete;
}
