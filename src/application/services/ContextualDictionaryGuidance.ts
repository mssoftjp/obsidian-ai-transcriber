import type { ContextualCorrection } from '../../ApiSettings';

export interface ContextualGuidanceEntry {
	from: string[];
	to: string;
	contextKeywords: string[];
	priority: number;
}

interface GuidanceLimits {
	maxEntries: number;
	maxCharacters: number;
}

type GuidanceLanguage = 'ja' | 'en' | 'zh' | 'ko';

const DEFAULT_LIMITS: GuidanceLimits = {
	maxEntries: 20,
	maxCharacters: 2000
};

const GUIDANCE_HEADERS: Record<GuidanceLanguage, string> = {
	ja: '文脈補正候補（本文にある表現だけを補正し、本文にない用語を追加しないでください）:',
	en: 'Contextual correction candidates (correct only expressions in the text. Do not add terms that are absent):',
	zh: '上下文修正候选（仅修正文中已有的表达，不要添加文中没有的术语）：',
	ko: '문맥 보정 후보(본문에 있는 표현만 보정하고 본문에 없는 용어를 추가하지 마세요):'
};

const CONTEXT_LABELS: Record<GuidanceLanguage, string> = {
	ja: '文脈',
	en: 'context',
	zh: '上下文',
	ko: '문맥'
};

export function selectContextualGuidance(
	entries: ContextualCorrection[],
	segment: string,
	language: GuidanceLanguage = 'ja',
	limits: GuidanceLimits = DEFAULT_LIMITS
): ContextualGuidanceEntry[] {
	const normalizedSegment = segment.toLocaleLowerCase();
	const relevant = entries
		.map((entry, index) => ({ entry, index }))
		.filter(({ entry }) => (
			entry.to.trim().length > 0 && entry.from.some(pattern => pattern.trim().length > 0)
		))
		.filter(({ entry }) => isRelevant(entry, normalizedSegment))
		.sort((left, right) => {
			const priorityDifference = (right.entry.priority ?? 0) - (left.entry.priority ?? 0);
			return priorityDifference !== 0 ? priorityDifference : left.index - right.index;
		});

	const selected: ContextualGuidanceEntry[] = [];
	for (const { entry } of relevant) {
		if (selected.length >= limits.maxEntries) {
			break;
		}
		const candidate = toGuidanceEntry(entry);
		if (formatContextualGuidance([...selected, candidate], language).length > limits.maxCharacters) {
			continue;
		}
		selected.push(candidate);
	}

	return selected;
}

export function formatContextualGuidance(
	entries: ContextualGuidanceEntry[],
	language: GuidanceLanguage = 'ja'
): string {
	if (entries.length === 0) {
		return '';
	}
	const lines = entries.map(entry => {
		const contexts = entry.contextKeywords.length > 0
			? `（${CONTEXT_LABELS[language]}: ${entry.contextKeywords.join('、')}）`
			: '';
		return `- ${entry.from.join(' / ')} → ${entry.to}${contexts}`;
	});
	return `${GUIDANCE_HEADERS[language]}\n${lines.join('\n')}`;
}

function isRelevant(entry: ContextualCorrection, normalizedSegment: string): boolean {
	const candidates = [
		...entry.from,
		entry.to,
		...(entry.contextKeywords ?? [])
	];
	return candidates.some(candidate => (
		candidate.length > 0 && normalizedSegment.includes(candidate.toLocaleLowerCase())
	));
}

function toGuidanceEntry(entry: ContextualCorrection): ContextualGuidanceEntry {
	return {
		from: [...entry.from],
		to: entry.to,
		contextKeywords: [...(entry.contextKeywords ?? [])],
		priority: entry.priority ?? 0
	};
}
