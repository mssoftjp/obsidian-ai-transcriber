/**
 * English translations
 */

import { TranslationKeys } from '../locales';

const en: TranslationKeys = {
	// Plugin info
	plugin: {
		name: 'AI Transcriber' // Not translated
	},
	
	// Settings
	settings: {
		title: 'AI Transcriber Settings',
		apiKey: {
			name: 'OpenAI API Key',
			desc: 'Your OpenAI API key',
			placeholder: 'Enter your OpenAI API key',
			testButton: 'Test Connection',
			testSuccess: 'Connection successful',
			testFailed: 'Connection failed. Please check your API key.',
			insecureWarning: 'OS encryption not available. Using fallback encryption method.',
			migrated: 'API key has been automatically migrated to the new encryption format.'
		},
		model: {
			name: 'Default Transcription Model',
			desc: 'Choose the AI model for transcription',
			comparison: 'Model Comparison:',
			whisper: 'Whisper-1',
			whisperDesc: 'Supports timestamped output',
			gpt4o: 'GPT-4o Transcribe',
			gpt4oDesc: 'High accuracy',
			gpt4oMini: 'GPT-4o Mini Transcribe',
			gpt4oMiniDesc: 'Low cost',
			whisperNoTimestamp: 'Whisper-1 (No Timestamps)',
			whisperWithTimestamp: 'Whisper-1 (With Timestamps)',
			gpt4oHigh: 'GPT-4o Transcribe',
			gpt4oMiniCost: 'GPT-4o Mini Transcribe'
		},
		vadMode: {
			name: 'VAD Mode',
			desc: 'Select how silence detection is handled before sending audio to OpenAI',
			options: {
				server: 'Server-side VAD (default)',
				local: 'Local WebRTC VAD (requires fvad.wasm)',
				disabled: 'Disable VAD'
			},
			missingWarning: 'fvad.wasm was not found. Download it from the official repository and place it in the plugin folder before enabling local VAD.'
		},
		language: {
			name: 'Language',
			desc: 'Primary language for transcription',
			autoDetect: 'Auto-detect',
			useObsidianLang: 'Use Obsidian language'
		},
		outputFormat: {
			name: 'Output Format',
			desc: 'How to format the transcription output',
			callout: 'Callout Block',
			quote: 'Quote Block',
			plain: 'Plain Text'
		},
		postProcessing: {
			name: 'Enable Post-Processing',
			desc: 'Use AI to enhance transcription with related information after completion'
		},
		dictionaryCorrection: {
			name: 'Enable Dictionary Correction',
			desc: 'Automatically correct transcription results using dictionary-based text correction'
		},
		outputFolder: {
			name: 'Output Folder',
			desc: 'Folder to save transcription results (empty for vault root)',
			placeholder: 'e.g., Transcriptions',
			select: 'Select Folder'
		},
		advanced: {
			title: 'Advanced Settings',
			chunkInfo: 'Chunk Settings Guide:',
			chunk180s: '180s (3 min): Recommended - Avoids timeouts',
			chunk300s: '300s (5 min): Default - Balanced performance',
			chunk600s: '600s (10 min): Maximum - May cause timeouts',
			chunkNote: 'Note: Smaller chunks are more reliable but may increase API calls'
		},
		progressUI: {
			title: 'Progress UI Settings',
			statusBar: 'Show Status Bar',
			statusBarDesc: 'Display transcription progress in the status bar',
			autoOpen: 'Auto-open Side Panel',
			autoOpenDesc: 'Automatically open the side panel when transcription starts',
			maxHistory: 'Maximum History Items',
			maxHistoryDesc: 'Number of transcription history items to keep (10-100)'
		},
		debug: {
			mode: 'Debug Mode',
			modeDesc: 'Output detailed console logs (for developers)'
		},
		dictionary: {
			name: 'User Dictionary',
			desc: 'Edit the dictionary to correct speech recognition errors',
			addButton: '+ Add',
			deleteButton: 'Delete',
			from: 'From',
			to: 'To',
			enabled: 'Enabled',
			category: 'Category',
			priority: 'Priority',
			context: 'Context',
			definiteCorrections: 'Definite Corrections',
			contextualCorrections: 'Contextual Corrections',
			importExport: 'Import/Export',
			importExportDesc: 'Import/Export dictionary data in JSON format',
			import: 'Import',
			export: 'Export',
			importSuccess: 'Dictionary imported successfully',
			exportSuccess: 'Dictionary exported successfully',
			importError: 'Import error: ',
			noDataToExport: 'No data to export',
			exportError: 'Export failed',
			importConfirm: 'What would you like to do with existing dictionary data?',
			replace: 'Replace',
			merge: 'Merge',
			manageDictionary: 'Dictionary Management',
			manageDictionaryDesc: 'Edit and manage user dictionary',
			openManager: 'Manage Dictionary',
			title: 'User Dictionary Management',
			fromPlaceholder: 'From (comma-separated)',
			toPlaceholder: 'To',
			autoModeDesc: 'All language dictionaries will be applied in auto-detect mode',
			languageModeDesc: 'Only {lang} dictionary will be applied. Note: Dictionary entries are suggestions used alongside AI processing. Depending on context and confidence scores, they may not always be applied.',
			contextPlaceholder: 'Keywords (comma-separated)',
			limitReached: 'Dictionary limit reached ({limit} entries)',
			categories: {
				noun: 'Noun',
				person: 'Person',
				place: 'Place',
				org: 'Organization',
				proper: 'Proper Noun',
				technical: 'Technical Term',
				spoken: 'Spoken Language',
				symbol: 'Symbol/Unit'
			}
		}
	},

	// Commands
	commands: {
		transcribeAudio: 'Transcribe audio file (API)',
		openPanel: 'Open AI Transcriber panel',
		contextMenu: 'Transcribe with AI'
	},

	// Ribbon
	ribbon: {
		tooltip: 'AI Transcriber'
	},

	// Status bar
	statusBar: {
		processing: 'Transcribing',
		completed: 'Transcription completed',
		failed: 'Transcription failed',
		cancelled: 'Transcription cancelled',
		clickToOpen: 'Click to view details'
	},

	// Notices
	notices: {
		apiKeyNotConfigured: 'API key not configured. Please add your OpenAI API key in settings.',
		apiKeyMissing: 'API key not configured. Please add your OpenAI API key in settings.',
		transcriptionComplete: 'Transcription completed successfully',
		transcriptionFailed: 'Transcription failed. Please try again.',
		transcriptionCancelled: 'Transcription cancelled',
		noAudioFile: 'No audio file selected',
		processingFile: 'Processing file: {fileName}',
		vadInitError: 'VAD initialization error: fvad.wasm file not found. Please place it in the plugin folder.',
		vadServerFallback: 'Local VAD module not found. Falling back to server-side VAD.',
		vadProcessingError: 'VAD processing error: {error}',
		vadUnavailable: 'VAD is unavailable, proceeding without silence removal.',
		externalFileNotSupported: 'External file processing will be implemented in the next phase',
		postProcessingComplete: 'Post-processing completed: {model} was used',
		postProcessingFailed: 'Post-processing failed. Using original transcription.',
		languageSet: 'Language set to: {language}',
		settingsSaved: 'Settings saved',
		largeFileWarning: 'Processing large file ({size} MB) may take time',
		unsupportedFormat: 'Unsupported audio format: {format}',
		legacyHistoryItem: 'Legacy history item - file path not recorded'
	},

	// Transcription Modal
	modal: {
		// Common modal buttons
		button: {
			ok: 'OK',
			cancel: 'Cancel'
		},
		audioFileSelection: {
			title: 'Select Audio File',
			searchPlaceholder: 'Search by filename...',
			sortBy: 'Sort by:',
			sortByCreated: 'Date created',
			sortByModified: 'Date modified',
			sortByDate: 'Date modified',
			sortByName: 'Name',
			sortByPath: 'Path',
			fileName: 'File Name',
			fileCreated: 'Date Created',
			filePath: 'Path',
			noFiles: 'No audio files found',
			selectExternal: 'Select from Outside Vault',
			copying: 'Copying file...',
			externalFileNotice: 'When selecting files from outside the vault, they will be temporarily copied to a folder within the vault due to Obsidian restrictions.\nCopied files will be deleted on the next startup.'
		},
		transcription: {
			title: 'AI Transcriber',
			fileInfo: 'File Information',
			modelLabel: 'Transcription AI Model',
			fileSize: 'Size: {size}',
			fileType: 'File Type: {type}',
			audioFile: 'Audio File',
			videoFile: 'Video File',
			extractingAudio: 'Extracting audio from video',
			largeFileWarning: 'Processing large file ({size} MB) may take time',
			costEstimate: 'Estimated Cost',
			costNote: 'Actual cost may vary based on processing',
			costDetails: 'Model: {model} • Rate: {rate}',
			timeRange: 'Time Range',
			selectTimeRange: 'Select specific time range (optional)',
			startTime: 'Start',
			endTime: 'End',
			duration: 'Duration: {duration}',
			metaInfoButton: 'Add Related Info',
			metaInfoButtonFilled: 'Related Info Added',
			processingOptions: {
				title: 'Processing Options',
				enablePostProcessing: 'Enable AI Post-Processing',
				enableDictionaryCorrection: 'Use User Dictionary in Post-Processing',
				outputFolder: 'Output Folder',
				relatedInfo: 'Related Information'
			},
			startButton: 'Start Transcription',
			cancelButton: 'Cancel',
			processing: 'Processing',
			preparingAudio: 'Preparing audio',
			transcribing: 'Transcribing',
			postProcessing: 'Post-processing with AI',
			savingResults: 'Saving results',
			completed: 'Completed',
			partialResult: '[Partial transcription result]'
		},
		postProcessing: {
			titlePre: 'Pre-transcription Related Information',
			titlePost: 'Post-transcription Processing',
			transcriptionPreview: 'Transcription Preview',
			relatedInfo: 'Related Information',
			metaInfoPlaceholder: 'Examples: Speakers (John Smith, Jane Doe), Topics (AI technology, machine learning), Technical terms (neural networks, deep learning), Context (meeting, interview), or any other information related to the audio content',
			metaInfoDescription: 'Enter any information about the audio content or speakers. This information will be used by AI for more accurate transcription and post-processing.',
			emptyInputError: 'Please enter related information.',
			templateOnlyError: 'Please enter actual information based on the template examples.',
			options: 'Options',
			enablePostProcessing: 'Use related information for post-processing',
			processButton: 'Process',
			cancelButton: 'Cancel',
			processing: 'Processing'
		}
	},

	// Errors
	errors: {
		general: 'An error occurred',
		audioLoad: 'Failed to load audio file',
		audioProcess: 'Failed to process audio',
		apiError: 'API error: {error}',
		networkError: 'Network error. Please check your connection.',
		timeout: 'Request timed out',
		cancelled: 'Operation cancelled',
		invalidResponse: 'Invalid response from server',
		vadInitFailed: 'VAD initialization failed: {error}',
		vadProcessFailed: 'VAD processing failed: {error}',
		apiKeyMissing: 'API key is missing',
		invalidApiKeyFormat: 'Invalid API key format. Key should start with "sk-"',
		invalidApiKey: 'Invalid API key',
		rateLimitExceeded: 'Rate limit exceeded. Please try again later',
		apiUnavailable: 'OpenAI API is temporarily unavailable',
		apiConnectionFailed: 'API connection failed (Status: {status})',
		chunkingFailed: 'Audio chunking failed',
		mergingFailed: 'Failed to merge transcription chunks',
		saveFailed: 'Failed to save transcription',
		createFileFailed: 'Failed to create transcription file: {error}',
		settingsLoad: 'Failed to load settings',
		settingsSave: 'Failed to save settings',
		fileNotFound: 'Transcription file not found',
		// Error Handler specific
		titles: {
			apiKeyCheck: 'API Key Check',
			apiUsageLimit: 'API Usage Limit',
			apiConnection: 'API Connection',
			fileError: 'File Error',
			fileAccessError: 'File Access Error',
			fileLoadError: 'File Load Error',
			networkError: 'Network Error',
			audioProcessError: 'Audio Processing Error',
			fileSizeError: 'File Size Error',
			unexpectedError: 'Unexpected Error'
		},
		messages: {
			apiKeyRecheck: 'Please check your API key again.',
			apiUsageLimitReached: 'API usage limit reached. Please wait before retrying.',
			apiConnectionIssue: 'There seems to be a connection issue. Please check your API key.',
			fileNotFound: 'Audio file not found. Please check if the file has been moved or deleted.',
			fileAccessDenied: 'Cannot access the file. Please check file permissions.',
			fileLoadFailed: 'Failed to load audio file. Please check the file format (MP3, WAV, M4A, etc.).',
			networkConnectionIssue: 'Please check your internet connection and retry when stable.',
			audioProcessFailed: 'Audio file processing failed. Please check if the file is corrupted or in a supported format.',
			fileSizeExceeded: 'File size exceeds limit (500MB max).',
			diskSpaceLow: 'Insufficient available space (remaining: {available}GB).',
			unexpectedErrorOccurred: 'An error occurred during processing. Please wait and try again.',
			noAudioTrack: 'The video file does not contain an audio track.',
			unsupportedVideoCodec: 'Unsupported video codec. Please convert to a different format.'
		},
		recoveryActions: {
			openSettings: 'Open Settings',
			connectionTest: 'Connection Test',
			checkSupportedFormats: 'Check Supported Formats',
			retry: 'Retry',
			tryOtherFormat: 'Try Other Format',
			checkSizeLimit: 'Check Size Limit',
			enableDebugMode: 'Enable Debug Mode'
		},
		notices: {
			settingsCheck: 'Please check your API key in settings',
			settingsConnectionTest: 'Please try the "Connection Test" button in settings',
			supportedFormats: 'Supported formats: Audio (MP3, WAV, M4A, FLAC, AAC, OGG), Video (MP4, MOV, AVI, MKV, WebM)',
			networkRetry: 'Please check network connection and try again',
			formatConversion: 'Please convert to WAV or MP3 format and try again',
			sizeLimit: 'GPT-4o: 20MB/25min, Whisper: 20MB',
			debugModeEnable: 'Enable debug mode in settings to view detailed logs'
		}
	},

	// Units
	units: {
		seconds: 's',
		minutes: 'min',
		hours: 'h',
		mb: 'MB',
		gb: 'GB'
	},

	// Audio Range Selection
	audioRange: {
		title: 'Audio Range Selection',
		description: 'Select specific time range to reduce hallucinations and processing time',
		audioDuration: 'Audio duration',
		enableSelection: 'Enable time range selection',
		startTime: 'Start',
		endTime: 'End'
	},

	// Common
	common: {
		noHistory: 'No transcription history',
		noActiveTask: 'No active transcription tasks',
		loading: 'Loading',
		processing: 'Processing',
		completed: 'Completed',
		failed: 'Failed',
		cancelled: 'Cancelled',
		retry: 'Retry',
		close: 'Close',
		save: 'Save',
		cancel: 'Cancel',
		delete: 'Delete',
		confirm: 'Confirm',
		yes: 'Yes',
		no: 'No',
		ok: 'OK',
		error: 'Error',
		warning: 'Warning',
		info: 'Info',
		success: 'Success',
		history: 'Transcription History',
		progressStatus: 'Progress Status',
		elapsedTime: 'Elapsed Time',
		searchForFile: 'Search for file with transcription timestamp "{timestamp}"?',
		search: 'Search',
		manualSearchRequired: 'Not found automatically. Please search manually.',
		multipleAudioFilesFound: 'Multiple audio files found',
		historyUpdated: 'History updated',
		selectFile: 'Select File',
		multipleFilesFound: 'Multiple files found. Please select:'
	},
	
	// Support section
	support: {
		message: 'If this plugin adds value for you and you would like to help support continued development, please use the buttons below:'
	}

};

export default en;
