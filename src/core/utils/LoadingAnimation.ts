/**
 * Shared loading animation utility
 */
export class LoadingAnimation {
	private loadingDotsCount = 0;
	private animationInterval: number | null = null;
	private isAnimating = false;
	
	/**
	 * Get the current loading dots pattern
	 */
	getLoadingDots(): string {
		// Simple rotating dots animation with fixed width
		const patterns = ['\u00A0\u00A0\u00A0', '.\u00A0\u00A0', '..\u00A0', '...']; // Using non-breaking spaces
		this.loadingDotsCount = (this.loadingDotsCount + 1) % patterns.length;
		return patterns[this.loadingDotsCount];
	}
	
	/**
	 * Start the animation with a callback
	 */
	start(callback: () => void, interval = 1000): void {
		if (this.isAnimating) {
			return;
		}
		
		this.isAnimating = true;
		this.loadingDotsCount = 0;
		
		// Clear any existing interval
		if (this.animationInterval !== null) {
			window.clearInterval(this.animationInterval);
		}
		
		// Initial call
		callback();
		
		// Set up interval
		this.animationInterval = window.setInterval(() => {
			if (this.isAnimating) {
				callback();
			}
		}, interval);
	}
	
	/**
	 * Stop the animation
	 */
	stop(): void {
		this.isAnimating = false;
		
		if (this.animationInterval !== null) {
			window.clearInterval(this.animationInterval);
			this.animationInterval = null;
		}
		
		this.loadingDotsCount = 0;
	}
	
	/**
	 * Check if animation is running
	 */
	isRunning(): boolean {
		return this.isAnimating;
	}
	
	/**
	 * Reset the animation state
	 */
	reset(): void {
		this.stop();
	}
	
	/**
	 * Clean up resources
	 */
	destroy(): void {
		this.stop();
	}
}