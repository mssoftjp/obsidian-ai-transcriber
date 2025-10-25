/**
 * Chinese translations
 */

import { TranslationKeys } from '../locales';

const zh: TranslationKeys = {
	// Plugin info
	plugin: {
		name: 'AI Transcriber' // Not translated
	},
	
	// Settings
	settings: {
		title: 'AI 转录设置',
		apiKey: {
			name: 'OpenAI API 密钥',
			desc: '输入您的 OpenAI API 密钥',
			placeholder: '输入您的 API 密钥',
			testButton: '测试连接',
			testSuccess: 'API 密钥有效',
			testFailed: 'API 密钥无效',
			insecureWarning: 'OS加密不可用。使用备用加密方法。',
			migrated: 'API密钥已自动迁移到新的加密格式。'
		},
		model: {
			name: '转录模型',
			desc: '选择用于转录的模型',
			comparison: '模型比较：',
			whisper: 'Whisper-1',
			whisperDesc: '支持时间戳输出',
			gpt4o: 'GPT-4o Transcribe',
			gpt4oDesc: '高精度',
			gpt4oMini: 'GPT-4o Mini Transcribe',
			gpt4oMiniDesc: '低成本',
			whisperNoTimestamp: 'Whisper: 无时间戳 / $0.006每分钟',
			whisperWithTimestamp: 'Whisper: 带时间戳 / $0.012每分钟',
			gpt4oHigh: 'GPT-4o Transcribe',
			gpt4oMiniCost: 'GPT-4o Mini Transcribe'
		},
		language: {
			name: '语言',
			desc: '设置转录语言（留空为自动检测）',
			autoDetect: '自动检测',
			useObsidianLang: '使用 Obsidian 语言设置'
		},
		outputFormat: {
			name: '输出格式',
			desc: '选择转录结果的输出格式',
			callout: '标注框',
			quote: '引用块',
			plain: '纯文本'
		},
		postProcessing: {
			name: '启用后处理',
			desc: '使用 GPT-4.1 mini 使用相关信息改善转录结果'
		},
		dictionaryCorrection: {
			name: '启用字典校正',
			desc: '使用基于字典的文本校正自动修正转录结果'
		},
		outputFolder: {
			name: '输出文件夹',
			desc: '设置保存转录结果的文件夹（留空使用当前文件夹）',
			placeholder: '示例：转录/',
			select: '选择文件夹'
		},
		advanced: {
			title: '高级设置',
			chunkInfo: '将长音频分割成小段以提高准确性',
			chunk180s: '3分钟段（推荐用于对话）',
			chunk300s: '5分钟段（平衡选项）',
			chunk600s: '10分钟段（长篇独白）',
			chunkNote: '较短的段提供更好的准确性但处理时间更长'
		},
		progressUI: {
			title: '进度显示设置',
			statusBar: '在状态栏显示进度',
			statusBarDesc: '在状态栏显示转录进度和状态',
			autoOpen: '自动打开进度面板',
			autoOpenDesc: '转录开始时自动打开进度面板',
			maxHistory: '最大历史记录',
			maxHistoryDesc: '保留的转录历史数量'
		},
		debug: {
			mode: '调试模式',
			modeDesc: '启用调试日志记录'
		},
		dictionary: {
			name: '用户词典',
			desc: '编辑词典以纠正语音识别错误',
			addButton: '+ 添加',
			deleteButton: '删除',
			from: '原文',
			to: '替换',
			enabled: '启用',
			category: '类别',
			priority: '优先级',
			context: '上下文',
			definiteCorrections: '固定修正',
			contextualCorrections: '上下文修正',
			importExport: '导入/导出',
			importExportDesc: '以JSON格式导入/导出词典数据',
			import: '导入',
			export: '导出',
			importSuccess: '词典导入成功',
			exportSuccess: '词典导出成功',
			importError: '导入错误: ',
			noDataToExport: '没有要导出的数据',
			exportError: '导出失败',
			importConfirm: '如何处理现有的词典数据？',
			replace: '替换',
			merge: '合并',
			manageDictionary: '词典管理',
			manageDictionaryDesc: '编辑和管理用户词典',
			openManager: '管理词典',
			title: '用户词典管理',
			fromPlaceholder: '转换前 (逗号分隔)',
			toPlaceholder: '转换后',
			autoModeDesc: '自动检测语言时将应用所有语言的词典',
			languageModeDesc: '仅应用{lang}词典。注：词典设置作为AI处理的辅助建议，受上下文和置信度影响，可能不会始终应用。',
			contextPlaceholder: '关键词 (逗号分隔)',
			limitReached: '词典项目数已达上限({limit}个)',
			categories: {
				noun: '名词',
				person: '人名',
				place: '地名',
				org: '组织名',
				proper: '专有名词',
				technical: '专业术语',
				spoken: '口语',
				symbol: '符号/单位'
			}
		}
	},

	// Commands
	commands: {
		transcribeAudio: '转录音频文件',
		openPanel: '打开转录面板',
		contextMenu: '转录此音频文件'
	},

	// Ribbon
	ribbon: {
		tooltip: '转录音频文件'
	},

	// Status bar
	statusBar: {
		processing: '转录中',
		completed: '转录完成',
		failed: '转录失败',
		cancelled: '已取消',
		clickToOpen: '点击打开面板'
	},

	// Notices
	notices: {
		apiKeyNotConfigured: '请先在设置中配置 API 密钥',
		apiKeyMissing: '请输入您的 OpenAI API 密钥',
		transcriptionComplete: '转录完成',
		transcriptionFailed: '转录失败',
		transcriptionCancelled: '转录已取消',
		noAudioFile: '请选择音频文件',
		processingFile: '正在处理文件：',
		vadInitError: 'VAD 初始化失败',
		vadServerFallback: '未找到本地 VAD 模块，已切换到服务器端 VAD。',
		vadProcessingError: 'VAD 处理失败',
		vadUnavailable: 'VAD 不可用，继续处理原始音频',
		externalFileNotSupported: '外部文件处理功能将在下一阶段实现',
		postProcessingComplete: '后处理完成',
		postProcessingFailed: '后处理失败',
		languageSet: '语言设置为：',
		settingsSaved: '设置已保存',
		largeFileWarning: '大文件可能需要更长时间处理',
		unsupportedFormat: '不支持的文件格式',
		legacyHistoryItem: '旧版本历史记录 - 未记录文件路径'
	},

	// Transcription Modal
	modal: {
		// Common modal buttons
		button: {
			ok: '确定',
			cancel: '取消'
		},
		audioFileSelection: {
			title: '选择音频文件',
			searchPlaceholder: '按文件名搜索...',
			sortBy: '排序：',
			sortByCreated: '创建日期',
			sortByModified: '修改日期',
			sortByDate: '修改日期',
			sortByName: '文件名',
			sortByPath: '路径',
			fileName: '文件名',
			fileCreated: '创建日期',
			filePath: '路径',
			noFiles: '未找到音频文件',
			selectExternal: '从库外选择',
			copying: '正在复制文件...',
			externalFileNotice: '从库外选择文件时，由于Obsidian的限制，文件将被临时复制到库内的文件夹中进行处理。\n复制的文件将在下次启动时删除。'
		},
		transcription: {
			title: 'AI Transcriber',
			fileInfo: '文件信息',
			modelLabel: '转录AI模型',
			fileSize: '文件大小：',
			fileType: '文件类型：{type}',
			audioFile: '音频文件',
			videoFile: '视频文件',
			extractingAudio: '正在从视频中提取音频',
			largeFileWarning: '大文件可能需要更长时间处理',
			costEstimate: '预估成本',
			costNote: '基于文件大小的估算',
			costDetails: '详细说明',
			timeRange: '时间范围（可选）',
			selectTimeRange: '选择音频的特定部分进行转录',
			startTime: '开始时间',
			endTime: '结束时间',
			duration: '持续时间',
			metaInfoButton: '相关信息输入',
			metaInfoButtonFilled: '相关信息（已填写）',
			processingOptions: {
				title: '处理选项',
				enablePostProcessing: '启用AI后处理',
				enableDictionaryCorrection: '在后处理中使用用户字典',
				outputFolder: '输出文件夹',
				relatedInfo: '相关信息'
			},
			startButton: '开始转录',
			cancelButton: '取消',
			processing: '处理中',
			preparingAudio: '准备音频',
			transcribing: '转录中',
			postProcessing: '后处理中',
			savingResults: '保存结果',
			completed: '完成！',
			partialResult: '（部分结果）'
		},
		postProcessing: {
			titlePre: '相关信息预输入',
			titlePost: '转录后相关信息',
			transcriptionPreview: '转录预览',
			relatedInfo: '相关信息',
			metaInfoPlaceholder: '输入相关信息...\n示例：\n发言人（张三、李四）\n主题（AI技术、机器学习）\n专业术语（神经网络、深度学习）\n上下文（会议、访谈）',
			metaInfoDescription: '输入音频相关信息。您可以包括发言人姓名、主题、专业术语、上下文等任何信息。AI将自动分类和组织这些信息。',
			emptyInputError: '请输入相关信息。',
			templateOnlyError: '请根据模板示例输入实际信息。',
			options: '选项',
			enablePostProcessing: '使用 AI 模型进行后处理',
			processButton: '保存',
			cancelButton: '取消',
			processing: '处理中'
		}
	},

	// Errors
	errors: {
		general: '发生错误',
		audioLoad: '加载音频文件失败',
		audioProcess: '处理音频失败',
		apiError: 'API 错误',
		networkError: '网络错误',
		timeout: '请求超时',
		cancelled: '操作已取消',
		invalidResponse: '无效的响应',
		vadInitFailed: 'VAD 初始化失败',
		vadProcessFailed: 'VAD 处理失败',
		apiKeyMissing: '缺少API密钥',
		invalidApiKeyFormat: 'API密钥格式无效。密钥应以"sk-"开头',
		invalidApiKey: '无效的API密钥',
		rateLimitExceeded: '已达到速率限制。请稍后重试',
		apiUnavailable: 'OpenAI API暂时不可用',
		apiConnectionFailed: 'API连接失败 (状态: {status})',
		chunkingFailed: '音频分段失败',
		mergingFailed: '合并结果失败',
		saveFailed: '保存失败',
		createFileFailed: '创建文件失败',
		settingsLoad: '加载设置失败',
		settingsSave: '保存设置失败',
		fileNotFound: '转录文件未找到',
		// Error Handler specific
		titles: {
			apiKeyCheck: 'API 密钥确认',
			apiUsageLimit: 'API 使用限制',
			apiConnection: 'API 连接',
			fileError: '文件错误',
			fileAccessError: '文件访问错误',
			fileLoadError: '文件加载错误',
			networkError: '网络错误',
			audioProcessError: '音频处理错误',
			fileSizeError: '文件大小错误',
			unexpectedError: '意外错误'
		},
		messages: {
			apiKeyRecheck: '请再次检查 API 密钥。',
			apiUsageLimitReached: '达到 API 使用限制。请稍后再试。',
			apiConnectionIssue: '连接似乎有问题。请检查 API 密钥。',
			fileNotFound: '找不到音频文件。请检查文件是否已移动或删除。',
			fileAccessDenied: '无法访问文件。请检查文件权限。',
			fileLoadFailed: '加载音频文件失败。请检查文件格式（MP3、WAV、M4A等）。',
			networkConnectionIssue: '请检查互联网连接。连接稳定后再试。',
			audioProcessFailed: '处理音频文件失败。请检查文件是否损坏或格式是否支持。',
			fileSizeExceeded: '文件大小超出限制（最大500MB）。',
			diskSpaceLow: '可用空间不足（剩余：{available}GB）。',
			unexpectedErrorOccurred: '处理过程中发生错误。请稍后再试。',
			noAudioTrack: '视频文件不包含音频轨道。',
			unsupportedVideoCodec: '不支持的视频编解码器。请转换为其他格式。'
		},
		recoveryActions: {
			openSettings: '打开设置',
			connectionTest: '连接测试',
			checkSupportedFormats: '检查支持的格式',
			retry: '重试',
			tryOtherFormat: '尝试其他文件格式',
			checkSizeLimit: '检查大小限制',
			enableDebugMode: '启用调试模式'
		},
		notices: {
			settingsCheck: '请在设置界面检查 API 密钥',
			settingsConnectionTest: '请尝试设置界面的"连接测试"按钮',
			supportedFormats: '支持的格式：音频（MP3、WAV、M4A、FLAC、AAC、OGG）、视频（MP4、MOV、AVI、MKV、WebM）',
			networkRetry: '检查网络连接后再试',
			formatConversion: '请转换为 WAV 或 MP3 格式后再试',
			sizeLimit: 'GPT-4o：20MB/25分钟，Whisper：20MB',
			debugModeEnable: '在设置界面启用调试模式可查看详细日志'
		}
	},

	// Units
	units: {
		seconds: '秒',
		minutes: '分钟',
		hours: '小时',
		mb: 'MB',
		gb: 'GB'
	},

	// Audio Range Selection
	audioRange: {
		title: '音频范围选择',
		description: '选择特定的时间范围以减少幻觉和处理时间',
		audioDuration: '音频时长',
		enableSelection: '启用时间范围选择',
		startTime: '开始',
		endTime: '结束'
	},

	// Common
	common: {
		noHistory: '无历史记录',
		noActiveTask: '无活动任务',
		loading: '加载中',
		processing: '处理中',
		completed: '已完成',
		failed: '失败',
		cancelled: '已取消',
		retry: '重试',
		close: '关闭',
		save: '保存',
		cancel: '取消',
		delete: '删除',
		confirm: '确认',
		yes: '是',
		no: '否',
		ok: '确定',
		error: '错误',
		warning: '警告',
		info: '信息',
		success: '成功',
		history: '历史',
		progressStatus: '进度状态',
		elapsedTime: '经过时间',
		searchForFile: '搜索带有转录时间戳"{timestamp}"的文件？',
		search: '搜索',
		manualSearchRequired: '未自动找到。请手动搜索。',
		multipleAudioFilesFound: '找到多个音频文件',
		historyUpdated: '历史已更新',
		selectFile: '选择文件',
		multipleFilesFound: '找到多个文件。请选择：'
	},
	
	// Support section
	support: {
		message: '如果这个插件对您有帮助，请支持我们的持续开发：'
	}
};

export default zh;
