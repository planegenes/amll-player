import type { OptimizeLyricOptions } from "@applemusic-like-lyrics/core";
import { invoke } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import i18n from "../i18n";
import type { PlayQueueManager } from "../utils/play-queue-manager.ts";
import type { PlaylistViewOptions } from "../utils/playlist-sort.ts";

export enum DarkMode {
	Auto = "auto",
	Light = "light",
	Dark = "dark",
}

export enum MusicContextMode {
	Local = "local",
	WSProtocol = "ws-protocol",
}

export const darkModeAtom = atomWithStorage(
	"amll-player.darkMode",
	DarkMode.Auto,
);

export const musicContextModeAtom = atomWithStorage(
	"amll-player.musicContextMode",
	MusicContextMode.Local,
);

export const optimizeNormalizeSpacesAtom = atomWithStorage(
	"amll-player.optimize.normalizeSpaces",
	true,
);

export const optimizeResetLineTimestampsAtom = atomWithStorage(
	"amll-player.optimize.resetLineTimestamps",
	true,
);

export const optimizeSyncMainAndBackgroundLinesAtom = atomWithStorage(
	"amll-player.optimize.syncMainAndBackgroundLines",
	true,
);

export const optimizeCleanUnintentionalOverlapsAtom = atomWithStorage(
	"amll-player.optimize.cleanUnintentionalOverlaps",
	true,
);

export const optimizeTryAdvanceStartTimeAtom = atomWithStorage(
	"amll-player.optimize.tryAdvanceStartTime",
	true,
);

export const optimizeLyricOptionsAtom = atom<OptimizeLyricOptions>((get) => ({
	normalizeSpaces: get(optimizeNormalizeSpacesAtom),
	resetLineTimestamps: get(optimizeResetLineTimestampsAtom),
	syncMainAndBackgroundLines: get(optimizeSyncMainAndBackgroundLinesAtom),
	cleanUnintentionalOverlaps: get(optimizeCleanUnintentionalOverlapsAtom),
	tryAdvanceStartTime: get(optimizeTryAdvanceStartTimeAtom),
}));

const enableMediaControlsInternalAtom = atomWithStorage(
	"amll-player.enableMediaControls",
	true,
);

export const enableMediaControlsAtom = atom(
	(get) => get(enableMediaControlsInternalAtom),
	(_get, set, enabled: boolean) => {
		set(enableMediaControlsInternalAtom, enabled);
		invoke("set_media_controls_enabled", { enabled }).catch((err) => {
			console.error("设置媒体控件的启用状态失败", err);
		});
	},
);

const enableAlwaysOnTopInternalAtom = atomWithStorage(
	"amll-player.enableAlwaysOnTop",
	false,
);

export const enableAlwaysOnTopAtom = atom(
	(get) => get(enableAlwaysOnTopInternalAtom),
	(_get, set, enabled: boolean) => {
		set(enableAlwaysOnTopInternalAtom, enabled);
		invoke("set_window_always_on_top", { enabled }).catch((err) => {
			console.error("设置窗口置顶状态失败", err);
		});
	},
);

export const wsProtocolListenAddrAtom = atomWithStorage(
	"amll-player.wsProtocolListenAddr",
	"localhost:11444",
);

export const showStatJSFrameAtom = atomWithStorage(
	"amll-player.showStatJSFrame",
	false,
);

/**
 * 播放完毕后暂停
 *
 * 开启后一首歌曲自然播放结束时不会切换到下一首，而是停留在当前歌曲并暂停播放；
 * 该行为优先于循环模式，关闭后恢复原有的循环模式行为。
 *
 * 该设置由播放队列管理器在 React 之外直接读取，因此必须开启 `getOnInit`，
 * 否则在没有任何组件订阅该 atom 时（例如刚启动、设置页尚未挂载）读到的永远是
 * 初始值 `false`，表现为「只有手动切换过一次开关才生效」。
 */
export const pauseAfterPlayEndAtom = atomWithStorage(
	"amll-player.pauseAfterPlayEnd",
	false,
	undefined,
	{ getOnInit: true },
);

export const autoDarkModeAtom = atom(true);

export const isDarkThemeAtom = atom(
	(get) =>
		get(darkModeAtom) === DarkMode.Auto
			? get(autoDarkModeAtom)
			: get(darkModeAtom) === DarkMode.Dark,
	(_get, set, newIsDark: boolean) =>
		set(darkModeAtom, newIsDark ? DarkMode.Dark : DarkMode.Light),
);

export const hasBackgroundAtom = atom(false);

export const playlistCardOpenedAtom = atom(false);

export const recordPanelOpenedAtom = atom(false);

export const amllMenuOpenedAtom = atom(false);

export const hideNowPlayingBarAtom = atom(false);

export const wsProtocolConnectedAddrsAtom = atom(new Set<string>());

export const isCheckingUpdateAtom = atom(false);

export const updateInfoAtom = atom<Update | false>(false);

export const autoUpdateAtom = atomWithStorage("amll-player.autoUpdate", true);

export const enableTaskbarLyricAtom = atomWithStorage(
	"amll-player.enableTaskbarLyric",
	false,
);

export const audioQualityDialogOpenedAtom = atom(false);

export const taskbarLyricThemeSettingAtom = atomWithStorage<
	"auto" | "light" | "dark"
>("amll-player.taskbarLyricTheme", "auto");
export const taskbarLyricAlignSettingAtom = atomWithStorage<
	"auto" | "left" | "right"
>("amll-player.taskbarLyricAlign", "auto");

export const taskbarLyricModeSettingAtom = atomWithStorage<
	"auto" | "single" | "double"
>("amll-player.taskbarLyricMode", "auto");

export enum BottomLyricDisplayMode {
	None = "none",
	OnlyLyricAuthors = "only-lyric-authors",
	OnlySongWriters = "only-song-writers",
	PreferLyricAuthors = "prefer-lyric-authors",
	PreferSongWriters = "prefer-song-writers",
}

export const bottomLyricDisplayModeAtom =
	atomWithStorage<BottomLyricDisplayMode>(
		"amll-player.bottomLyricDisplayMode",
		BottomLyricDisplayMode.PreferSongWriters,
	);

export const currentLyricAuthorsAtom = atom<string[]>([]);

export const currentSongWritersAtom = atom<string[]>([]);

/**
 * 歌词底部信息里「歌词作者」字段显示的名称
 *
 * 仅影响歌词页底部的键名文本，不会修改歌曲或歌词数据本身。留空时回退到默认名称。
 */
export const bottomLyricAuthorLabelAtom = atomWithStorage(
	"amll-player.bottomLyricAuthorLabel",
	"歌词作者",
);

/**
 * 歌词底部信息里「创作者」字段显示的名称
 *
 * 仅影响歌词页底部的键名文本，不会修改歌曲或歌词数据本身。留空时回退到默认名称。
 */
export const bottomLyricWriterLabelAtom = atomWithStorage(
	"amll-player.bottomLyricWriterLabel",
	"创作者",
);

/** 自定义显示信息的类型 */
export enum CustomBottomInfoType {
	/** 普通文本，仅显示一段内容 */
	Text = "text",
	/** 键值对，显示为「键名：内容」 */
	KeyValue = "key-value",
}

/** 一条自定义显示信息 */
export interface CustomBottomInfoItem {
	/** 唯一标识，仅用于列表编辑与渲染 */
	id: string;
	type: CustomBottomInfoType;
	/** 键值对类型的键名，普通文本类型下不显示 */
	key: string;
	/** 显示内容 */
	value: string;
}

/** 追加在歌词底部信息下方的自定义显示信息，每一项独占一行 */
export const customBottomInfoItemsAtom = atomWithStorage<CustomBottomInfoItem[]>(
	"amll-player.customBottomInfoItems",
	[],
);

/**
 * 逐字音译匹配：快速通道容差（毫秒）
 *
 * 主歌词字与音译音节的开始时间差在此范围内时直接配对。默认 2。
 */
export const romanizationFastTrackToleranceMsAtom = atomWithStorage(
	"amll-player.romanizationFastTrackToleranceMs",
	2,
);

/**
 * 逐字音译匹配：最小交并比（百分比，0 - 100）
 *
 * 快速通道未命中时按时间区间重合度取最接近的音译音节，重合度需达到此比例才采用。默认 10。
 */
export const romanizationMinIouPercentAtom = atomWithStorage(
	"amll-player.romanizationMinIouPercent",
	10,
);

export const queueManagerAtom = atom<PlayQueueManager | null>(null);

const _languageBaseAtom = atom(i18n.language);
export const languageAtom = atom(
	(get) => get(_languageBaseAtom),
	(_get, set, newLang: string) => {
		i18n.changeLanguage(newLang).then(() => {
			set(_languageBaseAtom, newLang);
		});
	},
);

export const availableLanguagesAtom = atom((get) => {
	const currentLang = get(languageAtom);
	const resources = i18n.options.resources ?? {};

	const languages = Object.keys(resources)
		.map((langId) => {
			try {
				const name =
					new Intl.DisplayNames(currentLang, { type: "language" }).of(langId) ||
					langId;
				const origName =
					new Intl.DisplayNames(langId, { type: "language" }).of(langId) ||
					langId;
				return {
					label: origName === name ? origName : `${origName} (${name})`,
					value: langId,
				};
			} catch {
				return { label: langId, value: langId };
			}
		})
		.filter((item) => item.label);

	languages.push({
		label: i18n.t("page.settings.general.displayLanguage.cimode", "本地化 ID"),
		value: "cimode",
	});

	return languages;
});

/** 每个歌单独立的排序与分组设置，键为歌单 ID */
export const playlistViewOptionsAtom = atomWithStorage<
	Record<string, PlaylistViewOptions>
>("amll-player.playlistViewOptions", {});
