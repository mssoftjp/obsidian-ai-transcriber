/**
 * Lightweight audio waveform visualizer with range selection
 * Using Web Audio API and Canvas for minimal dependencies
 */
export class AudioWaveformSelector {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private audioBuffer: AudioBuffer | null = null;
	private waveformData: { min: number; max: number }[] | null = null;
	private animationFrameId: number | null = null;
	private startTime = 0;
	private endTime = 0;
	private isDragging = false;
	private dragType: 'start' | 'end' | 'range' | null = null;
	private onRangeChange?: (start: number, end: number) => void;

	constructor(container: HTMLElement, width = 600, height = 100) {
		// Create canvas
		this.canvas = document.createElement('canvas');
		this.canvas.width = width;
		this.canvas.height = height;
		// Set canvas dimensions via properties
		this.canvas.className = 'audio-waveform-canvas ait-canvas-size ait-width-full ait-max-width-full';
		container.appendChild(this.canvas);

		this.ctx = this.canvas.getContext('2d')!;

		// Add event listeners
		this.setupEventListeners();
	}

	/**
	 * Load audio buffer and draw waveform
	 */
	loadAudio(audioBuffer: AudioBuffer): void {
		this.audioBuffer = audioBuffer;
		this.endTime = audioBuffer.duration;
		this.precomputeWaveform();
		this.requestDraw();
	}

	/**
	 * Set range change callback
	 */
	setOnRangeChange(callback: (start: number, end: number) => void) {
		this.onRangeChange = callback;
	}

	/**
	 * Get current time range
	 */
	getTimeRange(): { start: number; end: number } {
		return { start: this.startTime, end: this.endTime };
	}

	/**
	 * Set time range programmatically
	 */
	setTimeRange(start: number, end: number) {
		if (!this.audioBuffer) {
			return;
		}

		this.startTime = Math.max(0, Math.min(start, this.audioBuffer.duration));
		this.endTime = Math.max(this.startTime, Math.min(end, this.audioBuffer.duration));
		this.requestDraw();

		if (this.onRangeChange) {
			this.onRangeChange(this.startTime, this.endTime);
		}
	}

	/**
         * Draw waveform and selection
         */
	private drawInternal() {
		if (!this.audioBuffer) {
			return;
		}

		const { width, height } = this.canvas;
		const ctx = this.ctx;

		// Clear canvas with proper background
		ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--background-secondary') || '#f5f5f5';
		ctx.fillRect(0, 0, width, height);

		// Draw center line
		ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--background-modifier-border') || '#ccc';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, height / 2);
		ctx.lineTo(width, height / 2);
		ctx.stroke();

		// Draw waveform
		this.drawWaveform();

		// Draw selection overlay
		this.drawSelection();

		// Draw handles
		this.drawHandles();
	}

	private requestDraw() {
		this.animationFrameId ??= requestAnimationFrame(() => {
			this.drawInternal();
			this.animationFrameId = null;
		});
	}

	/**
	 * Draw audio waveform
	 */
	private drawWaveform() {
		if (!this.audioBuffer || !this.waveformData) {
			return;
		}

		const { width, height } = this.canvas;
		const ctx = this.ctx;
		const amp = height / 2;

		// Draw waveform as filled shape
		ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-normal') || '#333';
		ctx.globalAlpha = 0.7;

		for (let i = 0; i < width; i++) {
			const range = this.waveformData[i];
			if (!range) {
				continue;
			}

			const { min, max } = range;

			// Draw vertical line for this sample
			const minY = (1 + min) * amp;
			const maxY = (1 + max) * amp;
			const h = Math.abs(maxY - minY);

			if (h > 0.5) {
				ctx.fillRect(i, minY, 1, h);
			}
		}

		ctx.globalAlpha = 1.0;
	}

	private precomputeWaveform() {
		if (!this.audioBuffer) {
			return;
		}

		const { width } = this.canvas;
		const data = this.audioBuffer.getChannelData(0);
		const step = Math.ceil(data.length / width);

		this.waveformData = new Array<{ min: number; max: number }>(width);

		for (let i = 0; i < width; i++) {
			let min = 1.0;
			let max = -1.0;

			for (let j = 0; j < step; j++) {
				const datum = data[(i * step) + j];
				if (datum === undefined) {
					break;
				}
				if (datum < min) {
					min = datum;
				}
				if (datum > max) {
					max = datum;
				}
			}

			this.waveformData[i] = { min, max };
		}
	}

	/**
	 * Draw selection area
	 */
	private drawSelection() {
		if (!this.audioBuffer) {
			return;
		}

		const { width, height } = this.canvas;
		const ctx = this.ctx;
		const duration = this.audioBuffer.duration;

		const startX = (this.startTime / duration) * width;
		const endX = (this.endTime / duration) * width;

		// Draw selection area
		ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--interactive-accent') || '#7c3aed';
		ctx.globalAlpha = 0.2;
		ctx.fillRect(startX, 0, endX - startX, height);
		ctx.globalAlpha = 1.0;

		// Draw selection borders
		ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--interactive-accent') || '#7c3aed';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(startX, 0);
		ctx.lineTo(startX, height);
		ctx.moveTo(endX, 0);
		ctx.lineTo(endX, height);
		ctx.stroke();
	}

	/**
	 * Draw draggable handles
	 */
	private drawHandles() {
		if (!this.audioBuffer) {
			return;
		}

		const { width, height } = this.canvas;
		const ctx = this.ctx;
		const duration = this.audioBuffer.duration;

		const startX = (this.startTime / duration) * width;
		const endX = (this.endTime / duration) * width;
		const handleWidth = 12; // Wider for easier grabbing
		const handleHeight = 30; // Taller for easier grabbing

		// Start handle
		ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--interactive-accent') || '#7c3aed';
		ctx.fillRect(startX - handleWidth/2, height/2 - handleHeight/2, handleWidth, handleHeight);

		// End handle
		ctx.fillRect(endX - handleWidth/2, height/2 - handleHeight/2, handleWidth, handleHeight);

		// Time labels
		ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-normal') || '#333';
		ctx.font = '12px sans-serif';
		ctx.textAlign = 'center';

		// Start time
		const startText = this.formatTime(this.startTime);
		ctx.fillText(startText, startX, height - 5);

		// End time
		const endText = this.formatTime(this.endTime);
		ctx.fillText(endText, endX, height - 5);
	}

	/**
	 * Setup mouse event listeners
	 */
	private setupEventListeners() {
		this.canvas.addEventListener('mousedown', this.handleMouseDown);
		this.canvas.addEventListener('mousemove', this.handleMouseMove);
		this.canvas.addEventListener('mouseup', this.handleMouseUp);
		this.canvas.addEventListener('mouseleave', this.handleMouseUp);

		// Touch events for mobile
		this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
		this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
		this.canvas.addEventListener('touchend', this.handleTouchEnd, { passive: false });
	}

	private handleMouseDown = (e: MouseEvent): void => {
		if (!this.audioBuffer) {
			return;
		}

		const rect = this.canvas.getBoundingClientRect();
		const scaleX = this.canvas.width / rect.width; // Handle canvas scaling
		const x = (e.clientX - rect.left) * scaleX;
		const duration = this.audioBuffer.duration;
		const width = this.canvas.width;

		const startX = (this.startTime / duration) * width;
		const endX = (this.endTime / duration) * width;
		const handleThreshold = 15; // Increased for easier grabbing

		// Check which handle is clicked
		if (Math.abs(x - startX) < handleThreshold) {
			this.isDragging = true;
			this.dragType = 'start';
		} else if (Math.abs(x - endX) < handleThreshold) {
			this.isDragging = true;
			this.dragType = 'end';
		} else if (x > startX && x < endX) {
			this.isDragging = true;
			this.dragType = 'range';
		}

		this.canvas.classList.remove('ait-cursor-default', 'ait-cursor-grab', 'ait-cursor-ew-resize');
		this.canvas.classList.add('ait-cursor-grabbing');
	};

	private handleMouseMove = (e: MouseEvent): void => {
		if (!this.audioBuffer) {
			return;
		}

		const rect = this.canvas.getBoundingClientRect();
		const scaleX = this.canvas.width / rect.width; // Handle canvas scaling
		const x = (e.clientX - rect.left) * scaleX;
		const duration = this.audioBuffer.duration;
		const width = this.canvas.width;
		const time = Math.max(0, Math.min((x / width) * duration, duration));

		// Update cursor
		if (!this.isDragging) {
			const startX = (this.startTime / duration) * width;
			const endX = (this.endTime / duration) * width;
			const handleThreshold = 15; // Match the mousedown threshold

			if (Math.abs(x - startX) < handleThreshold || Math.abs(x - endX) < handleThreshold) {
				this.canvas.classList.remove('ait-cursor-default', 'ait-cursor-grab', 'ait-cursor-grabbing');
				this.canvas.classList.add('ait-cursor-ew-resize');
			} else if (x > startX && x < endX) {
				this.canvas.classList.remove('ait-cursor-default', 'ait-cursor-ew-resize', 'ait-cursor-grabbing');
				this.canvas.classList.add('ait-cursor-grab');
			} else {
				this.canvas.classList.remove('ait-cursor-grab', 'ait-cursor-ew-resize', 'ait-cursor-grabbing');
				this.canvas.classList.add('ait-cursor-default');
			}
		}

		// Handle dragging
		if (this.isDragging && this.dragType) {
			if (this.dragType === 'start') {
				this.startTime = Math.max(0, Math.min(time, this.endTime - 1));
			} else if (this.dragType === 'end') {
				this.endTime = Math.max(this.startTime + 1, Math.min(time, duration));
			} else {
				const range = this.endTime - this.startTime;
				const center = time;
				this.startTime = Math.max(0, center - range/2);
				this.endTime = Math.min(duration, this.startTime + range);
				if (this.endTime === duration) {
					this.startTime = duration - range;
				}
			}

			this.requestDraw();

			if (this.onRangeChange) {
				this.onRangeChange(this.startTime, this.endTime);
			}
		}
	};

	private handleMouseUp = (): void => {
		this.isDragging = false;
		this.dragType = null;
		this.canvas.classList.remove('ait-cursor-grab', 'ait-cursor-ew-resize', 'ait-cursor-grabbing');
		this.canvas.classList.add('ait-cursor-default');
	};

	// Touch event handlers
	private handleTouchStart = (e: TouchEvent): void => {
		e.preventDefault();
		const touch = e.touches[0];
		if (!touch) {
			return;
		}
		const mouseEvent = new MouseEvent('mousedown', {
			clientX: touch.clientX,
			clientY: touch.clientY
		});
		this.handleMouseDown(mouseEvent);
	};

	private handleTouchMove = (e: TouchEvent): void => {
		e.preventDefault();
		const touch = e.touches[0];
		if (!touch) {
			return;
		}
		const mouseEvent = new MouseEvent('mousemove', {
			clientX: touch.clientX,
			clientY: touch.clientY
		});
		this.handleMouseMove(mouseEvent);
	};

	private handleTouchEnd = (e: TouchEvent): void => {
		e.preventDefault();
		this.handleMouseUp();
	};

	/**
	 * Format time in MM:SS
	 */
	private formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	/**
	 * Cleanup
	 */
	destroy() {
		this.canvas.remove();
	}
}
