/**
 * WebRTC VAD-based boundary detector for natural chunk splitting
 * Uses voice activity detection to find optimal chunk boundaries
 */

import { ProcessedAudio } from '../audio/AudioTypes';
import { VADProcessor } from '../../vad/VadTypes';
import { Logger } from '../../utils/Logger';

/**
 * Create a boundary detector using WebRTC VAD
 */
export function createWebRTCVADBoundaryDetector(vadProcessor: VADProcessor) {
	/**
	 * Detect natural boundaries in audio using VAD
	 * Returns positions (in seconds) where chunks can be split
	 */
	return async function detectBoundaries(audio: ProcessedAudio): Promise<number[]> {
		
		try {
			// Process audio with VAD to find speech segments
			const vadResult = await vadProcessor.processAudio(audio.pcmData, audio.sampleRate);
			
			
			// If no segments or only one segment, return default boundaries
			if (vadResult.segments.length <= 1) {
				return [];
			}
			
			// Find silence gaps between segments as potential boundaries
			const boundaries: number[] = [];
			const MIN_SILENCE_DURATION = 0.5; // Minimum 0.5s silence for a boundary
			
			for (let i = 0; i < vadResult.segments.length - 1; i++) {
				const currentSegment = vadResult.segments[i];
				const nextSegment = vadResult.segments[i + 1];
				
				// Calculate silence duration between segments
				const silenceStart = currentSegment.end;
				const silenceEnd = nextSegment.start;
				const silenceDuration = silenceEnd - silenceStart;
				
				// Only consider significant silence gaps
				if (silenceDuration >= MIN_SILENCE_DURATION) {
					// Use the middle of the silence gap as boundary
					const boundaryTime = (silenceStart + silenceEnd) / 2;
					boundaries.push(boundaryTime);
					
				}
			}
			
			return boundaries;
			
		} catch (error) {
			Logger.getLogger('WebRTCVADBoundaryDetector').error('Error detecting boundaries:', error);
			// Return empty array on error to fall back to default chunking
			return [];
		}
	};
}

/**
 * Find the best boundary near a target position
 * Used to snap chunk positions to natural boundaries
 */
export function findNearestBoundary(
	targetPosition: number,
	boundaries: number[],
	maxDistance: number = 5.0 // Maximum 5 seconds deviation
): number {
	if (boundaries.length === 0) {
		return targetPosition;
	}
	
	let nearestBoundary = targetPosition;
	let minDistance = maxDistance;
	
	for (const boundary of boundaries) {
		const distance = Math.abs(boundary - targetPosition);
		if (distance < minDistance) {
			minDistance = distance;
			nearestBoundary = boundary;
		}
	}
	
	// If no boundary within maxDistance, return original position
	return minDistance < maxDistance ? nearestBoundary : targetPosition;
}