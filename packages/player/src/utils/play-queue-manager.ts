import {
	isShuffleActiveAtom,
	musicPlayingPositionAtom,
	RepeatMode,
	repeatModeAtom,
} from "@applemusic-like-lyrics/react-full";
import { atom, type createStore, type PrimitiveAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { pauseAfterPlayEndAtom } from "../states/appAtoms.ts";
import type { Song } from "./db-client.ts";
import { db } from "./db-client.ts";
import { emitAudioThread } from "./player.ts";

type JotaiStore = ReturnType<typeof createStore>;

//#region 持久化数据结构
interface PersistedQueueState {
	/** playList 中的 songId 序列 */
	songIds: string[];
	/** originalList 中的 songId 序列（用于 shuffle 恢复） */
	originalSongIds: string[];
	currentIndex: number;
	repeatMode: RepeatMode;
	shuffleActive: boolean;
	playlistId: number | null;
	/** 当前歌曲的播放位置（秒） */
	position: number;
}

const EMPTY_PERSISTED_STATE: PersistedQueueState = {
	songIds: [],
	originalSongIds: [],
	currentIndex: -1,
	repeatMode: RepeatMode.Off,
	shuffleActive: false,
	playlistId: null,
	position: 0,
};

/** 持久化存储 atom（localStorage） */
export const persistedQueueStateAtom = atomWithStorage<PersistedQueueState>(
	"amll-player.playQueue",
	EMPTY_PERSISTED_STATE,
	undefined,
	{ getOnInit: true },
);
//#endregion

//#region 派生 Atom（只读，供 UI 消费）
export const queuePlaylistAtom: PrimitiveAtom<Song[]> = atom<Song[]>([]);
export const queueCurrentIndexAtom: PrimitiveAtom<number> = atom(0);
export const queueRepeatModeAtom: PrimitiveAtom<RepeatMode> = atom<RepeatMode>(
	RepeatMode.Off,
);
export const queueShuffleActiveAtom: PrimitiveAtom<boolean> = atom(false);
export const queuePlaylistIdAtom: PrimitiveAtom<number | null> = atom<
	number | null
>(null);
/** 当前播放的歌曲（派生） */
export const queueCurrentSongAtom = atom<Song | null>((get) => {
	const playlist = get(queuePlaylistAtom);
	const index = get(queueCurrentIndexAtom);
	return playlist[index] ?? null;
});
/** 队列是否有数据（用于判断是否需要恢复） */
export const queueHasDataAtom = atom<boolean>((get) => {
	return get(queuePlaylistAtom).length > 0;
});
//#endregion

/** Fisher-Yates 洗牌算法 */
function shuffleArray<T>(arr: readonly T[]): T[] {
	const result = [...arr];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

export class PlayQueueManager {
	private store: JotaiStore;
	private originalList: Song[] = [];
	private playList: Song[] = [];
	private currentIndex = -1;
	private repeatMode: RepeatMode = RepeatMode.Off;
	private shuffleActive = false;
	private playlistId: number | null = null;
	/** 上一次自然播放结束时是否停在了队列末尾（暂停但未切歌） */
	private endPaused = false;

	constructor(store: JotaiStore) {
		this.store = store;
	}

	//#region 辅助方法
	private syncToAtoms(): void {
		this.store.set(queuePlaylistAtom, [...this.playList]);
		this.store.set(queueCurrentIndexAtom, this.currentIndex);
		this.store.set(queueRepeatModeAtom, this.repeatMode);
		this.store.set(queueShuffleActiveAtom, this.shuffleActive);
		this.store.set(queuePlaylistIdAtom, this.playlistId);
		this.store.set(repeatModeAtom, this.repeatMode);
		this.store.set(isShuffleActiveAtom, this.shuffleActive);
		this.persistState();
	}

	/** 将当前队列状态写入 localStorage */
	private persistState(): void {
		const positionMs = this.store.get(musicPlayingPositionAtom);
		this.store.set(persistedQueueStateAtom, {
			songIds: this.playList.map((s) => s.id),
			originalSongIds: this.originalList.map((s) => s.id),
			currentIndex: this.currentIndex,
			repeatMode: this.repeatMode,
			shuffleActive: this.shuffleActive,
			playlistId: this.playlistId,
			position: positionMs / 1000,
		});
	}

	/** 组件卸载时调用，把最新状态写入 localStorage */
	dispose(): void {
		this.persistState();
	}

	private syncPlayModeToMediaControls(): void {
		const repeatMode =
			this.repeatMode === RepeatMode.All
				? "all"
				: this.repeatMode === RepeatMode.One
					? "one"
					: "off";
		emitAudioThread("updatePlayMode", {
			isShuffling: this.shuffleActive,
			repeatMode,
		});
	}

	private playSongAt(index: number): void {
		if (index < 0 || index >= this.playList.length) return;
		this.currentIndex = index;
		this.endPaused = false;
		this.syncToAtoms();
		const song = this.playList[index];
		emitAudioThread("playAudio", {
			song: {
				songId: song.id,
				filePath: song.filePath,
			},
		});
	}

	/**
	 * 取当前歌曲在 playList 中的「同 id 第几次出现」序号
	 *
	 * 队列允许同一首歌出现多次，因此定位当前歌曲不能只看 songId，
	 * 还需要额外记录它是该歌曲的第几个副本。
	 */
	private getCurrentOccurrence(): {
		songId: string;
		occurrence: number;
	} | null {
		const current =
			this.currentIndex >= 0 ? this.playList[this.currentIndex] : undefined;
		if (!current) return null;

		let occurrence = 0;
		for (let i = 0; i < this.currentIndex; i++) {
			if (this.playList[i]?.id === current.id) occurrence++;
		}
		return { songId: current.id, occurrence };
	}

	/** 在 playList 中查找「指定歌曲的第 n 次出现」的索引 */
	private findOccurrenceInPlayList(songId: string, occurrence: number): number {
		let seen = 0;
		for (let i = 0; i < this.playList.length; i++) {
			if (this.playList[i]?.id !== songId) continue;
			if (seen === occurrence) return i;
			seen++;
		}
		return -1;
	}

	/**
	 * 把 `playList` 中的下标映射到 `originalList` 中的下标
	 *
	 * 两个列表是同一批歌曲的两种顺序，随机播放时位置不一定一致，
	 * 因此按「同 id 的第 n 次出现」对应，以支持同一首歌重复出现。
	 */
	private findOriginalIndex(playIndex: number): number {
		const target = this.playList[playIndex];
		if (!target) return -1;

		let occurrence = 0;
		for (let i = 0; i < playIndex; i++) {
			if (this.playList[i]?.id === target.id) occurrence++;
		}

		let seen = 0;
		for (let i = 0; i < this.originalList.length; i++) {
			if (this.originalList[i]?.id !== target.id) continue;
			if (seen === occurrence) return i;
			seen++;
		}
		return -1;
	}
	//#endregion

	//#region 队列设置
	/**
	 * 设置完整播放队列并开始播放第一首
	 * @param songs - Song[]（来自后端 DB）
	 * @param playlistId - 来源播放列表 ID（可选）
	 */
	setQueue(songs: Song[], playlistId?: number): void {
		if (songs.length === 0) return;
		this.originalList = [...songs];
		this.playlistId = playlistId ?? null;

		if (this.shuffleActive) {
			this.playList = shuffleArray(songs);
		} else {
			this.playList = [...songs];
		}

		this.playSongAt(0);
	}

	/**
	 * 用单首歌替换整个队列并播放
	 */
	replaceQueueAndPlay(song: Song): void {
		this.originalList = [song];
		this.playList = [song];
		this.playlistId = null;
		this.playSongAt(0);
	}

	/**
	 * 将歌曲添加到队尾
	 *
	 * 队列允许同一首歌重复出现，因此这里不做去重。
	 */
	addToQueue(song: Song): void {
		this.originalList.push(song);

		if (this.shuffleActive) {
			// 随机模式下，插入到当前播放位置的下一位
			const insertAt = this.currentIndex + 1;
			this.playList.splice(insertAt, 0, song);
		} else {
			this.playList.push(song);
		}

		this.syncToAtoms();
	}

	/**
	 * 将歌曲插入到当前播放歌曲之后（即「下一首播放」）
	 *
	 * 队列为空或尚未开始播放时直接加入队列；队列允许同一首歌重复出现，不做去重。
	 */
	insertNextToPlay(song: Song): void {
		const insertAt = this.currentIndex >= 0 ? this.currentIndex + 1 : 0;
		this.playList.splice(insertAt, 0, song);

		if (this.shuffleActive) {
			// 随机模式下原始顺序与播放顺序无关，追加到原始队列末尾即可
			this.originalList.push(song);
		} else {
			// 非随机模式下两个列表保持同序，插入位置必须一致
			this.originalList.splice(
				Math.min(insertAt, this.originalList.length),
				0,
				song,
			);
		}

		this.syncToAtoms();
	}
	//#endregion

	//#region 播放控制
	/** 跳转到指定索引播放 */
	playAt(index: number): void {
		this.playSongAt(index);
	}

	/** 用户手动点击下一首（无视单曲循环） */
	advanceForUser(): void {
		if (this.playList.length === 0) return;
		const nextIndex = (this.currentIndex + 1) % this.playList.length;
		this.playSongAt(nextIndex);
	}

	/** 用户手动点击下一首（无视单曲循环） */
	retreatForUser(): void {
		if (this.playList.length === 0) return;
		const prevIndex =
			this.currentIndex - 1 < 0
				? this.playList.length - 1
				: this.currentIndex - 1;
		this.playSongAt(prevIndex);
	}

	/**
	 * 歌曲自然播放结束时调用
	 * - 开启「播放完毕后暂停」：不切歌，直接暂停当前歌曲（优先于所有循环模式）
	 * - 单曲循环：重播当前歌曲
	 * - 顺序/随机：播放下一首
	 * - 列表播放完毕（非循环）：停止
	 */
	advanceForAutoEnd(): void {
		if (this.playList.length === 0) return;

		if (this.store.get(pauseAfterPlayEndAtom)) {
			// 停在当前歌曲的末尾，不切歌
			this.endPaused = true;
			emitAudioThread("pauseAudio");
			return;
		}

		if (this.repeatMode === RepeatMode.One) {
			this.playSongAt(this.currentIndex);
			return;
		}

		const nextIndex = this.currentIndex + 1;
		if (nextIndex >= this.playList.length) {
			if (this.repeatMode === RepeatMode.All) {
				// 列表循环：回到第一首
				this.playSongAt(0);
				return;
			}

			// RepeatMode.Off
			this.endPaused = true;
			emitAudioThread("pauseAudio");
			return;
		}

		this.playSongAt(nextIndex);
	}

	/**
	 * 自然播放结束后是否处于「停在末尾」的暂停状态
	 *
	 * 此状态下播放器已释放音频流，此时请求播放应当从头重播当前歌曲。
	 */
	isEndPaused(): boolean {
		return this.endPaused;
	}

	/** 从头重播当前歌曲（用于停在末尾的暂停状态下请求播放） */
	replayCurrentSong(): void {
		if (this.currentIndex < 0) return;
		this.playSongAt(this.currentIndex);
	}
	//#endregion

	//#region 模式切换
	setRepeatMode(mode: RepeatMode): void {
		this.repeatMode = mode;
		this.syncToAtoms();
		this.syncPlayModeToMediaControls();
	}

	cycleRepeatMode(): void {
		const nextMode: RepeatMode =
			this.repeatMode === RepeatMode.Off
				? RepeatMode.All
				: this.repeatMode === RepeatMode.All
					? RepeatMode.One
					: RepeatMode.Off;
		this.setRepeatMode(nextMode);
	}

	toggleShuffle(): void {
		// 队列允许同一首歌出现多次，因此要记住当前歌曲是「同 id 的第几个副本」
		const current = this.getCurrentOccurrence();

		this.shuffleActive = !this.shuffleActive;

		if (this.shuffleActive) {
			this.playList = shuffleArray(this.originalList);
		} else {
			this.playList = [...this.originalList];
		}

		if (current) {
			const newIndex = this.findOccurrenceInPlayList(
				current.songId,
				current.occurrence,
			);
			if (newIndex !== -1) {
				this.currentIndex = newIndex;
			}
		}

		this.syncToAtoms();
		this.syncPlayModeToMediaControls();
	}

	toggleShuffleOn(): void {
		if (this.shuffleActive) return;
		this.toggleShuffle();
	}

	toggleShuffleOff(): void {
		if (!this.shuffleActive) return;
		this.toggleShuffle();
	}
	//#endregion

	//#region 队列修改
	/**
	 * 将队列中的歌曲移动到新的位置
	 *
	 * 非随机模式下两个列表顺序一致，按同一组下标同步移动 `originalList`，
	 * 保证关闭随机播放后顺序一致；随机模式下只调整当前播放顺序。
	 * 无论哪种模式，`currentIndex` 都会跟随被移动的歌曲，保证当前播放指示不漂移。
	 *
	 * @param fromIndex 歌曲当前索引
	 * @param toIndex 目标索引（超出范围或与当前索引相同时不做任何事）
	 */
	moveSong(fromIndex: number, toIndex: number): void {
		const { length } = this.playList;
		if (fromIndex < 0 || fromIndex >= length) return;
		if (toIndex < 0 || toIndex >= length) return;
		if (fromIndex === toIndex) return;

		const [moved] = this.playList.splice(fromIndex, 1);
		if (!moved) return;
		this.playList.splice(toIndex, 0, moved);

		if (!this.shuffleActive) {
			const [movedOriginal] = this.originalList.splice(fromIndex, 1);
			if (movedOriginal) {
				this.originalList.splice(toIndex, 0, movedOriginal);
			}
		}

		if (this.currentIndex === fromIndex) {
			this.currentIndex = toIndex;
		} else if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) {
			this.currentIndex--;
		} else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) {
			this.currentIndex++;
		}

		this.syncToAtoms();
	}

	/**
	 * 从队列中移除指定位置的歌曲
	 *
	 * 只移除这一份，不影响同一首歌在队列中的其他副本。
	 */
	removeAt(index: number): void {
		if (index < 0 || index >= this.playList.length) return;

		// 先算好原始队列中对应的位置，再开始删除
		const originalIndex = this.findOriginalIndex(index);

		this.playList.splice(index, 1);
		if (originalIndex !== -1) {
			this.originalList.splice(originalIndex, 1);
		}

		if (index < this.currentIndex) {
			this.currentIndex--;
		} else if (index === this.currentIndex) {
			if (this.playList.length === 0) {
				this.currentIndex = -1;
			} else if (this.currentIndex >= this.playList.length) {
				this.currentIndex = 0;
			}
			if (this.currentIndex >= 0) {
				this.playSongAt(this.currentIndex);
				return;
			}
		}

		this.syncToAtoms();
	}

	/**
	 * 从队列中移除一首歌的所有副本
	 *
	 * 供「从歌单中删除歌曲」这类需要按歌曲 id 清理队列的场景使用。
	 */
	removeSong(songId: string): void {
		let index = this.playList.findIndex((s) => s.id === songId);
		while (index !== -1) {
			this.removeAt(index);
			index = this.playList.findIndex((s) => s.id === songId);
		}
	}
	//#endregion

	//#region 恢复队列
	/**
	 * 从 localStorage 恢复队列状态
	 *
	 * 需要从后端 DB 批量查询 songId → Song 映射
	 * @returns 恢复结果，包含是否成功及持久化的播放位置（秒）
	 */
	async restore(): Promise<{ restored: boolean; position: number }> {
		const persisted = this.store.get(persistedQueueStateAtom);
		if (!persisted || persisted.songIds.length === 0)
			return { restored: false, position: 0 };

		try {
			const allSongIds = [
				...new Set([...persisted.songIds, ...persisted.originalSongIds]),
			];
			const songs = await db.songs.getByIds(allSongIds);
			const songMap = new Map(songs.map((s) => [s.id, s]));

			// 恢复 playList
			this.playList = persisted.songIds
				.map((id) => songMap.get(id))
				.filter((s): s is Song => s !== undefined);

			// 恢复 originalList
			this.originalList = persisted.originalSongIds
				.map((id) => songMap.get(id))
				.filter((s): s is Song => s !== undefined);

			// 如果 originalList 因为某些歌曲被删除而为空，用 playList 兜底
			if (this.originalList.length === 0) {
				this.originalList = [...this.playList];
			}

			if (this.playList.length === 0) return { restored: false, position: 0 };

			// 恢复状态
			this.repeatMode = persisted.repeatMode;
			this.shuffleActive = persisted.shuffleActive;
			this.playlistId = persisted.playlistId;

			// 恢复 currentIndex，做边界检查
			this.currentIndex = Math.min(
				persisted.currentIndex,
				this.playList.length - 1,
			);
			if (this.currentIndex < 0) this.currentIndex = 0;

			this.syncToAtoms();
			return { restored: true, position: persisted.position ?? 0 };
		} catch (err) {
			console.error("[PlayQueueManager] 恢复队列失败:", err);
			return { restored: false, position: 0 };
		}
	}

	//#region 查询
	getCurrentSong(): Song | null {
		return this.playList[this.currentIndex] ?? null;
	}

	getPlayList(): Song[] {
		return [...this.playList];
	}

	getCurrentIndex(): number {
		return this.currentIndex;
	}

	getRepeatMode(): RepeatMode {
		return this.repeatMode;
	}

	isShuffleActive(): boolean {
		return this.shuffleActive;
	}

	getPlaylistId(): number | null {
		return this.playlistId;
	}
	//#endregion
}
