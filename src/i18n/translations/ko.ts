/**
 * Korean translations
 */

import { TranslationKeys } from '../locales';

const ko: TranslationKeys = {
	// Plugin info
	plugin: {
		name: 'AI Transcriber' // Not translated
	},
	
	// Settings
	settings: {
		title: 'AI Transcriber 설정',
		apiKey: {
			name: 'OpenAI API 키',
			desc: 'OpenAI API 키를 입력하세요',
			placeholder: 'OpenAI API 키 입력',
			testButton: '연결 테스트',
			testSuccess: '연결 성공',
			testFailed: '연결 실패. API 키를 확인하세요.',
			insecureWarning: 'OS 암호화를 사용할 수 없습니다. 대체 암호화 방식을 사용합니다.',
			migrated: 'API 키가 새로운 암호화 형식으로 자동 마이그레이션되었습니다.'
		},
		model: {
			name: '기본 전사 모델',
			desc: '전사에 사용할 AI 모델 선택',
			comparison: '모델 비교:',
			whisper: 'Whisper-1',
			whisperDesc: '타임스탬프 출력 지원',
			gpt4o: 'GPT-4o Transcribe',
			gpt4oDesc: '높은 정확도',
			gpt4oMini: 'GPT-4o Mini Transcribe',
			gpt4oMiniDesc: '저비용',
			whisperNoTimestamp: 'Whisper-1 (타임스탬프 없음)',
			whisperWithTimestamp: 'Whisper-1 (타임스탬프 있음)',
			gpt4oHigh: 'GPT-4o Transcribe',
			gpt4oMiniCost: 'GPT-4o Mini Transcribe'
		},
		language: {
			name: '언어',
			desc: '전사의 기본 언어',
			autoDetect: '자동 감지',
			useObsidianLang: 'Obsidian 언어 사용'
		},
		outputFormat: {
			name: '출력 형식',
			desc: '전사 출력 형식 설정',
			callout: '콜아웃 블록',
			quote: '인용 블록',
			plain: '일반 텍스트'
		},
		postProcessing: {
			name: '후처리 활성화',
			desc: '완료 후 AI를 사용하여 관련 정보로 전사를 향상시킵니다'
		},
		dictionaryCorrection: {
			name: '사전 교정 활성화',
			desc: '사전 기반 텍스트 교정을 사용하여 전사 결과를 자동으로 교정합니다'
		},
		outputFolder: {
			name: '출력 폴더',
			desc: '전사 결과를 저장할 폴더 (비워두면 vault 루트)',
			placeholder: '예: Transcriptions',
			select: '폴더 선택'
		},
		advanced: {
			title: '고급 설정',
			chunkInfo: '청크 설정 가이드:',
			chunk180s: '180초 (3분): 권장 - 타임아웃 회피',
			chunk300s: '300초 (5분): 기본값 - 균형 잡힌 성능',
			chunk600s: '600초 (10분): 최대 - 타임아웃 가능성 있음',
			chunkNote: '주의: 작은 청크가 더 안정적이지만 API 호출이 증가할 수 있습니다'
		},
		progressUI: {
			title: '진행 상황 UI 설정',
			statusBar: '상태 표시줄 표시',
			statusBarDesc: '상태 표시줄에 전사 진행 상황을 표시합니다',
			autoOpen: '사이드 패널 자동 열기',
			autoOpenDesc: '전사 시작 시 사이드 패널을 자동으로 엽니다',
			maxHistory: '최대 기록 항목 수',
			maxHistoryDesc: '보관할 전사 기록 항목 수 (10-100)'
		},
		debug: {
			mode: '디버그 모드',
			modeDesc: '상세한 콘솔 로그를 출력합니다 (개발자용)'
		},
		dictionary: {
			name: '사용자 사전',
			desc: '음성 인식 오류를 수정하기 위한 사전을 편집할 수 있습니다',
			addButton: '+ 추가',
			deleteButton: '삭제',
			from: '변환원',
			to: '변환후',
			enabled: '활성화',
			category: '카테고리',
			priority: '우선순위',
			context: '컨텍스트',
			definiteCorrections: '고정 보정',
			contextualCorrections: '문맥 보정',
			importExport: '가져오기/내보내기',
			importExportDesc: '사전 데이터를 JSON 형식으로 가져오기/내보내기 할 수 있습니다',
			import: '가져오기',
			export: '내보내기',
			importSuccess: '사전을 가져왔습니다',
			exportSuccess: '사전을 내보냈습니다',
			importError: '가져오기 오류: ',
			noDataToExport: '내보낼 데이터가 없습니다',
			exportError: '내보내기에 실패했습니다',
			importConfirm: '기존 사전 데이터를 어떻게 하시겠습니까?',
			replace: '바꾸기',
			merge: '통합',
			manageDictionary: '사전 관리',
			manageDictionaryDesc: '사용자 사전을 편집하고 관리합니다',
			openManager: '사전 관리',
			title: '사용자 사전 관리',
			fromPlaceholder: '변환원 (쉼표로 구분)',
			toPlaceholder: '변환후',
			autoModeDesc: '자동 감지 모드에서는 모든 언어 사전이 적용됩니다',
			languageModeDesc: '{lang} 사전만 적용됩니다. ※사전 설정은 AI 처리의 보조 제안으로 사용되며, 문맥과 신뢰도에 따라 항상 적용되지 않을 수 있습니다.',
			contextPlaceholder: '키워드 (쉼표로 구분)',
			limitReached: '사전 항목 수가 제한({limit}개)에 도달했습니다',
			categories: {
				noun: '명사',
				person: '인물',
				place: '장소',
				org: '조직',
				proper: '고유명사',
				technical: '기술 용어',
				spoken: '구어체',
				symbol: '기호/단위'
			}
		}
	},

	// Commands
	commands: {
		transcribeAudio: '오디오 파일 전사 (API)',
		openPanel: 'AI 전사 패널 열기',
		contextMenu: 'AI로 전사'
	},

	// Ribbon
	ribbon: {
		tooltip: 'AI 전사'
	},

	// Status bar
	statusBar: {
		processing: '전사 중',
		completed: '전사 완료',
		failed: '전사 실패',
		cancelled: '전사 취소됨',
		clickToOpen: '클릭하여 상세 정보 보기'
	},

	// Notices
	notices: {
		apiKeyNotConfigured: 'API 키가 설정되지 않았습니다. 설정에서 OpenAI API 키를 추가하세요.',
		apiKeyMissing: 'API 키가 설정되지 않았습니다. 설정에서 OpenAI API 키를 추가하세요.',
		transcriptionComplete: '전사가 성공적으로 완료되었습니다',
		transcriptionFailed: '전사가 실패했습니다. 다시 시도해주세요.',
		transcriptionCancelled: '전사가 취소되었습니다',
		noAudioFile: '선택된 오디오 파일이 없습니다',
		processingFile: '파일 처리 중: {fileName}',
		vadInitError: 'VAD 초기화 오류: fvad.wasm 파일을 찾을 수 없습니다. 플러그인 폴더에 배치해주세요.',
		vadProcessingError: 'VAD 처리 오류: {error}',
		vadUnavailable: 'VAD를 사용할 수 없어 무음 제거 없이 진행합니다.',
		externalFileNotSupported: '외부 파일 처리는 다음 단계에서 구현될 예정입니다',
		postProcessingComplete: '후처리 완료: {model}이 사용되었습니다',
		postProcessingFailed: '후처리 실패. 원본 전사를 사용합니다.',
		languageSet: '언어 설정: {language}',
		settingsSaved: '설정 저장됨',
		largeFileWarning: '큰 파일 ({size} MB) 처리에 시간이 걸릴 수 있습니다',
		unsupportedFormat: '지원되지 않는 오디오 형식: {format}',
		legacyHistoryItem: '레거시 기록 - 파일 경로가 기록되지 않음'
	},

	// Transcription Modal
	modal: {
		// Common modal buttons
		button: {
			ok: '확인',
			cancel: '취소'
		},
		audioFileSelection: {
			title: '오디오 파일 선택',
			searchPlaceholder: '파일명으로 검색...',
			sortBy: '정렬:',
			sortByCreated: '생성일',
			sortByModified: '수정일',
			sortByDate: '수정일',
			sortByName: '이름',
			sortByPath: '경로',
			fileName: '파일 이름',
			fileCreated: '생성일',
			filePath: '경로',
			noFiles: '오디오 파일을 찾을 수 없습니다',
			selectExternal: 'Vault 외부에서 선택',
			copying: '파일 복사 중...',
			externalFileNotice: 'Vault 외부에서 파일을 선택하면 Obsidian 제한으로 인해 vault 내의 폴더로 임시로 복사됩니다.\n복사된 파일은 다음 시작 시 삭제됩니다.'
		},
		transcription: {
			title: 'AI 전사',
			fileInfo: '파일 정보',
			modelLabel: '전사 AI 모델',
			fileSize: '크기: {size}',
			fileType: '파일 유형: {type}',
			audioFile: '오디오 파일',
			videoFile: '비디오 파일',
			extractingAudio: '비디오에서 오디오 추출 중',
			largeFileWarning: '큰 파일 ({size} MB) 처리에 시간이 걸릴 수 있습니다',
			costEstimate: '예상 비용',
			costNote: '실제 비용은 처리에 따라 달라질 수 있습니다',
			costDetails: '모델: {model} • 요금: {rate}',
			timeRange: '시간 범위',
			selectTimeRange: '특정 시간 범위 선택 (선택사항)',
			startTime: '시작',
			endTime: '종료',
			duration: '지속시간: {duration}',
			metaInfoButton: '관련 정보 추가',
			metaInfoButtonFilled: '관련 정보 추가됨',
			processingOptions: {
				title: '처리 옵션',
				enablePostProcessing: 'AI 후처리 활성화',
				enableDictionaryCorrection: '후처리에서 사용자 사전 사용',
				outputFolder: '출력 폴더',
				relatedInfo: '관련 정보'
			},
			startButton: '전사 시작',
			cancelButton: '취소',
			processing: '처리 중',
			preparingAudio: '오디오 준비 중',
			transcribing: '전사 중',
			postProcessing: 'AI로 후처리 중',
			savingResults: '결과 저장 중',
			completed: '완료',
			partialResult: '[부분 전사 결과]'
		},
		postProcessing: {
			titlePre: '전사 전 관련 정보',
			titlePost: '전사 후 처리',
			transcriptionPreview: '전사 미리보기',
			relatedInfo: '관련 정보',
			metaInfoPlaceholder: '예시: 화자 (김철수, 이영희), 주제 (AI 기술, 머신러닝), 기술 용어 (신경망, 딥러닝), 컨텍스트 (회의, 인터뷰), 또는 오디오 콘텐츠와 관련된 기타 정보',
			metaInfoDescription: '오디오 콘텐츠나 화자에 대한 정보를 입력하세요. 이 정보는 AI가 더 정확한 전사와 후처리를 위해 사용됩니다.',
			emptyInputError: '관련 정보를 입력해주세요.',
			templateOnlyError: '템플릿 예시를 참고하여 실제 정보를 입력해주세요.',
			options: '옵션',
			enablePostProcessing: '후처리에 관련 정보 사용',
			processButton: '처리',
			cancelButton: '취소',
			processing: '처리 중'
		}
	},

	// Errors
	errors: {
		general: '오류가 발생했습니다',
		audioLoad: '오디오 파일을 불러오지 못했습니다',
		audioProcess: '오디오 처리에 실패했습니다',
		apiError: 'API 오류: {error}',
		networkError: '네트워크 오류. 연결을 확인해주세요.',
		timeout: '요청 시간 초과',
		cancelled: '작업이 취소되었습니다',
		invalidResponse: '서버로부터 잘못된 응답을 받았습니다',
		vadInitFailed: 'VAD 초기화 실패: {error}',
		vadProcessFailed: 'VAD 처리 실패: {error}',
		apiKeyMissing: 'API 키가 없습니다',
		invalidApiKeyFormat: '잘못된 API 키 형식입니다. 키는 "sk-"로 시작해야 합니다',
		invalidApiKey: '잘못된 API 키',
		rateLimitExceeded: '요청 한도를 초과했습니다. 나중에 다시 시도해주세요',
		apiUnavailable: 'OpenAI API가 일시적으로 사용할 수 없습니다',
		apiConnectionFailed: 'API 연결 실패 (상태: {status})',
		chunkingFailed: '오디오 청크 분할 실패',
		mergingFailed: '전사 청크 병합 실패',
		saveFailed: '전사 저장 실패',
		createFileFailed: '전사 파일 생성 실패: {error}',
		settingsLoad: '설정 불러오기 실패',
		settingsSave: '설정 저장 실패',
		fileNotFound: '전사 파일을 찾을 수 없습니다',
		// Error Handler specific
		titles: {
			apiKeyCheck: 'API 키 확인',
			apiUsageLimit: 'API 사용 한도',
			apiConnection: 'API 연결',
			fileError: '파일 오류',
			fileAccessError: '파일 접근 오류',
			fileLoadError: '파일 로드 오류',
			networkError: '네트워크 오류',
			audioProcessError: '오디오 처리 오류',
			fileSizeError: '파일 크기 오류',
			unexpectedError: '예기치 않은 오류'
		},
		messages: {
			apiKeyRecheck: 'API 키를 다시 확인해주세요.',
			apiUsageLimitReached: 'API 사용 한도에 도달했습니다. 잠시 후 다시 시도해주세요.',
			apiConnectionIssue: '연결 문제가 있는 것 같습니다. API 키를 확인해주세요.',
			fileNotFound: '오디오 파일을 찾을 수 없습니다. 파일이 이동되거나 삭제되었는지 확인해주세요.',
			fileAccessDenied: '파일에 접근할 수 없습니다. 파일 권한을 확인해주세요.',
			fileLoadFailed: '오디오 파일을 로드하지 못했습니다. 파일 형식(MP3, WAV, M4A 등)을 확인해주세요.',
			networkConnectionIssue: '인터넷 연결을 확인하고 안정적일 때 다시 시도해주세요.',
			audioProcessFailed: '오디오 파일 처리에 실패했습니다. 파일이 손상되었거나 지원되지 않는 형식인지 확인해주세요.',
			fileSizeExceeded: '파일 크기가 한도를 초과했습니다 (최대 500MB).',
			diskSpaceLow: '사용 가능한 공간이 부족합니다 (남은 공간: {available}GB).',
			unexpectedErrorOccurred: '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
			noAudioTrack: '비디오 파일에 오디오 트랙이 없습니다.',
			unsupportedVideoCodec: '지원되지 않는 비디오 코덱입니다. 다른 형식으로 변환해주세요.'
		},
		recoveryActions: {
			openSettings: '설정 열기',
			connectionTest: '연결 테스트',
			checkSupportedFormats: '지원 형식 확인',
			retry: '재시도',
			tryOtherFormat: '다른 형식 시도',
			checkSizeLimit: '크기 제한 확인',
			enableDebugMode: '디버그 모드 활성화'
		},
		notices: {
			settingsCheck: '설정에서 API 키를 확인해주세요',
			settingsConnectionTest: '설정에서 "연결 테스트" 버튼을 시도해주세요',
			supportedFormats: '지원 형식: 오디오 (MP3, WAV, M4A, FLAC, AAC, OGG), 비디오 (MP4, MOV, AVI, MKV, WebM)',
			networkRetry: '네트워크 연결을 확인하고 다시 시도해주세요',
			formatConversion: 'WAV 또는 MP3 형식으로 변환한 후 다시 시도해주세요',
			sizeLimit: 'GPT-4o: 20MB/25분, Whisper: 20MB',
			debugModeEnable: '자세한 로그를 보려면 설정에서 디버그 모드를 활성화하세요'
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
		title: '오디오 범위 선택',
		description: '할루시네이션을 줄이고 처리 시간을 단축하기 위해 특정 시간 범위를 선택하세요',
		audioDuration: '오디오 길이',
		enableSelection: '시간 범위 선택 활성화',
		startTime: '시작',
		endTime: '종료'
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
		message: '이 플러그인이 도움이 되었다면, 지속적인 개발을 위해 지원해 주세요:'
	}
};

export default ko;