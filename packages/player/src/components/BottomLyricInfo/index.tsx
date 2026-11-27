import {
	LyricSizePreset,
	lyricSizePresetAtom,
} from "@applemusic-like-lyrics/react-full";
import { useAtomValue } from "jotai";
import { type FC, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
	BottomLyricDisplayMode,
	bottomLyricAuthorLabelAtom,
	bottomLyricDisplayModeAtom,
	bottomLyricWriterLabelAtom,
	CustomBottomInfoType,
	currentLyricAuthorsAtom,
	currentSongWritersAtom,
	customBottomInfoItemsAtom,
} from "../../states/appAtoms";
import styles from "./index.module.css";

function getBottomInfoFontSize(preset: LyricSizePreset): string {
	switch (preset) {
		case LyricSizePreset.Tiny:
			return "max(max(1.5vh, 0.75vw), 10px)";
		case LyricSizePreset.ExtraSmall:
			return "max(max(1.8vh, 0.9vw), 10px)";
		case LyricSizePreset.Small:
			return "max(max(2.4vh, 1.2vw), 10px)";
		case LyricSizePreset.Large:
			return "max(max(3.6vh, 1.8vw), 12px)";
		case LyricSizePreset.ExtraLarge:
			return "max(max(4.2vh, 2.1vw), 14px)";
		case LyricSizePreset.Huge:
			return "max(max(4.8vh, 2.4vw), 16px)";
		default:
			return "max(max(3vh, 1.5vw), 10px)";
	}
}

export const BottomLyricInfo: FC = () => {
	const { t } = useTranslation();
	const mode = useAtomValue(bottomLyricDisplayModeAtom);
	const lyricAuthors = useAtomValue(currentLyricAuthorsAtom);
	const songWriters = useAtomValue(currentSongWritersAtom);
	const lyricSizePreset = useAtomValue(lyricSizePresetAtom);
	const authorLabel = useAtomValue(bottomLyricAuthorLabelAtom);
	const writerLabel = useAtomValue(bottomLyricWriterLabelAtom);

	// 键名文本可以在设置里自定义，留空时回退到默认的本地化名称
	const authorTitle = `${authorLabel.trim() || t("bottom_lyric.lyricAuthor", "歌词作者")}${t("bottom_lyric.customInfoSeparator", "：")}`;
	const writerTitle = `${writerLabel.trim() || t("bottom_lyric.songWriter", "创作者")}${t("bottom_lyric.customInfoSeparator", "：")}`;

	const displayContent = useMemo(() => {
		if (mode === BottomLyricDisplayMode.None) {
			return null;
		}

		const hasLyrics = lyricAuthors.length > 0;
		const hasWriters = songWriters.length > 0;

		const renderLyrics = () => (
			<>
				<span className={styles.textContent}>
					<strong>{authorTitle}</strong>
				</span>
				{lyricAuthors.map((author, index) => (
					<span key={`${author}-${index}`}>
						<a
							href={`https://github.com/${author}`}
							target="_blank"
							rel="noreferrer noopener"
							className={styles.authorName}
						>
							<span className={styles.textContent}>{author}</span>
						</a>
						<span className={styles.textContent}>
							{index < lyricAuthors.length - 1 ? ", " : ""}
						</span>
					</span>
				))}
			</>
		);

		const renderWriters = () => (
			<>
				<span className={styles.textContent}>
					<strong>{writerTitle}</strong>
				</span>
				{songWriters.map((writer, index) => (
					<span key={`${writer}-${index}`}>
						<span className={styles.textContent}>{writer}</span>
						<span className={styles.textContent}>
							{index < songWriters.length - 1 ? ", " : ""}
						</span>
					</span>
				))}
			</>
		);

		const renderBothGroups = (lyricAuthorsFirst: boolean) => (
			<>
				<div className={styles.customInfoItem}>
					{lyricAuthorsFirst ? renderLyrics() : renderWriters()}
				</div>
				<div className={styles.customInfoItem}>
					{lyricAuthorsFirst ? renderWriters() : renderLyrics()}
				</div>
			</>
		);

		switch (mode) {
			case BottomLyricDisplayMode.OnlyLyricAuthors:
				return hasLyrics ? renderLyrics() : null;

			case BottomLyricDisplayMode.OnlySongWriters:
				return hasWriters ? renderWriters() : null;

			case BottomLyricDisplayMode.PreferLyricAuthors:
				if (hasLyrics) return renderLyrics();
				if (hasWriters) return renderWriters();
				return null;

			case BottomLyricDisplayMode.PreferSongWriters:
				if (hasWriters) return renderWriters();
				if (hasLyrics) return renderLyrics();
				return null;

			case BottomLyricDisplayMode.PreferBothLyricAuthorsFirst:
			case BottomLyricDisplayMode.PreferBothSongWritersFirst:
				// 两组信息都存在时各占一行，先后顺序由模式决定；只有一组时回退到单组显示
				if (hasLyrics && hasWriters) {
					return renderBothGroups(
						mode === BottomLyricDisplayMode.PreferBothLyricAuthorsFirst,
					);
				}
				if (hasLyrics) return renderLyrics();
				if (hasWriters) return renderWriters();
				return null;

			default:
				return null;
		}
	}, [mode, lyricAuthors, songWriters, t, authorTitle, writerTitle]);

	if (!displayContent) return null;

	return (
		<div
			className={styles.bottomInfo}
			style={{
				fontSize: getBottomInfoFontSize(lyricSizePreset),
			}}
		>
			{displayContent}
		</div>
	);
};

/**
 * 自定义显示信息
 *
 * 渲染在底部信息之后，每个条目独占一行，字体尺寸与底部信息保持一致
 */
export const BottomCustomInfo: FC = () => {
	const { t } = useTranslation();
	const items = useAtomValue(customBottomInfoItemsAtom);
	const lyricSizePreset = useAtomValue(lyricSizePresetAtom);

	const visibleItems = useMemo(
		() =>
			items.filter((item) =>
				item.type === CustomBottomInfoType.KeyValue
					? item.key.trim() !== "" || item.value.trim() !== ""
					: item.value.trim() !== "",
			),
		[items],
	);

	if (visibleItems.length === 0) return null;

	return (
		<div
			className={styles.bottomInfo}
			style={{
				fontSize: getBottomInfoFontSize(lyricSizePreset),
			}}
		>
			{visibleItems.map((item) => (
				<div key={item.id} className={styles.customInfoItem}>
					{item.type === CustomBottomInfoType.KeyValue &&
						item.key.trim() !== "" && (
							<span className={styles.textContent}>
								<strong>{item.key}</strong>
								{t("bottom_lyric.customInfoSeparator", "：")}
							</span>
						)}
					<span className={styles.textContent}>{item.value}</span>
				</div>
			))}
		</div>
	);
};
