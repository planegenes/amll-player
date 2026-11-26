import { musicPlayingAtom } from "@applemusic-like-lyrics/react-full";
import { ArrowDownIcon, ArrowUpIcon, Cross2Icon } from "@radix-ui/react-icons";
import {
	Avatar,
	Flex,
	type FlexProps,
	IconButton,
	Inset,
	Text,
} from "@radix-ui/themes";
import { useVirtualizer } from "@tanstack/react-virtual";
import { convertFileSrc } from "@tauri-apps/api/core";
import classNames from "classnames";
import { useAtomValue } from "jotai";
import { type FC, type HTMLProps, useEffect, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import { isDarkThemeAtom, queueManagerAtom } from "../../states/appAtoms.ts";
import type { Song } from "../../utils/db-client.ts";
import {
	queueCurrentIndexAtom,
	queuePlaylistAtom,
} from "../../utils/play-queue-manager.ts";
import styles from "./index.module.css";

/**
 * 当前播放歌曲的声纹指示图标
 *
 * 播放中时四根竖条循环跳动，暂停时保持静态声纹形状；系统开启
 * 「减少动态效果」时由 CSS 自动退化为静态。
 */
const WaveformIndicator: FC<{ playing: boolean }> = ({ playing }) => {
	const { t } = useTranslation();

	return (
		<span
			className={classNames(styles.waveform, playing && styles.waveformPlaying)}
			role="img"
			aria-label={t("playbar.playlist.playingIndicator", "正在播放")}
			title={t("playbar.playlist.playingIndicator", "正在播放")}
		>
			<span />
			<span />
			<span />
			<span />
		</span>
	);
};

/**
 * 队列条目本身的视觉高度（不含条目间距），需与 index.module.css 中
 * `.playlistSongItem` 的计算结果保持一致
 */
const QUEUE_ITEM_HEIGHT = 66;

/** 条目之间的间距，对应 CSS 变量 `--queue-item-gap` */
const QUEUE_ITEM_GAP = 4;

/** 虚拟列表的单行高度，必须等于条目高度 + 间距，否则条目会溢出自身的行盒 */
const QUEUE_ROW_HEIGHT = QUEUE_ITEM_HEIGHT + QUEUE_ITEM_GAP;

const PlaylistSongItem: FC<
	{
		song: Song;
		index: number;
		/** 队列总长度，用于判断下移按钮是否到达末尾 */
		total: number;
	} & HTMLProps<HTMLDivElement>
> = ({ song, className, index, total, ...props }) => {
	const { t } = useTranslation();
	const playlistIndex = useAtomValue(queueCurrentIndexAtom);
	const queueManager = useAtomValue(queueManagerAtom);
	const musicPlaying = useAtomValue(musicPlayingAtom);

	const cover = song.coverPath
		? song.coverPath.startsWith("http://") || song.coverPath.startsWith("https://")
			? song.coverPath
			: convertFileSrc(song.coverPath)
		: "";
	const name = song.songName || "未知歌曲";
	const artists = song.songArtists || "未知艺术家";

	return (
		<div className={className} {...props}>
			<div
				className={classNames(
					styles.playlistSongItem,
					playlistIndex === index && styles.playing,
				)}
			>
				<button
					type="button"
					className={styles.songButton}
					onDoubleClick={() => {
						queueManager?.playAt(index);
					}}
					aria-label={`播放 ${name} - ${artists}`}
				>
					<Avatar size="4" fallback={<div />} src={cover} />
					<div className={styles.musicInfo}>
						<div className={styles.name}>{name}</div>
						<div className={styles.artists}>{artists}</div>
					</div>
					{playlistIndex === index && (
						<WaveformIndicator playing={musicPlaying} />
					)}
				</button>
				<IconButton
					className={styles.actionButton}
					variant="ghost"
					color="gray"
					size="1"
					disabled={index <= 0}
					title={t("playbar.playlist.moveUp", "上移一位")}
					aria-label={t("playbar.playlist.moveUp", "上移一位")}
					onClick={() => queueManager?.moveSong(index, index - 1)}
				>
					<ArrowUpIcon />
				</IconButton>
				<IconButton
					className={styles.actionButton}
					variant="ghost"
					color="gray"
					size="1"
					disabled={index >= total - 1}
					title={t("playbar.playlist.moveDown", "下移一位")}
					aria-label={t("playbar.playlist.moveDown", "下移一位")}
					onClick={() => queueManager?.moveSong(index, index + 1)}
				>
					<ArrowDownIcon />
				</IconButton>
				<IconButton
					className={styles.actionButton}
					variant="ghost"
					color="gray"
					size="1"
					title={t("playbar.playlist.removeSong", "从播放队列中移除")}
					aria-label={t("playbar.playlist.removeSong", "从播放队列中移除")}
					onClick={() => {
						queueManager?.removeSong(song.id);
					}}
				>
					<Cross2Icon />
				</IconButton>
			</div>
		</div>
	);
};

export const NowPlaylistCard: FC<FlexProps & { onClose?: () => void }> = ({
	onClose,
	className,
	...props
}) => {
	const { t } = useTranslation();
	const playlist = useAtomValue(queuePlaylistAtom);
	const playlistIndex = useAtomValue(queueCurrentIndexAtom);
	const isDarkTheme = useAtomValue(isDarkThemeAtom);
	const playlistContainerRef = useRef<HTMLDivElement>(null);
	const cardRef = useRef<HTMLDivElement>(null);

	// 点击卡片外部区域时自动收起
	useEffect(() => {
		if (!onClose) return;

		const handlePointerDown = (evt: PointerEvent) => {
			const target = evt.target;
			if (!(target instanceof Element)) return;
			if (cardRef.current?.contains(target)) return;
			// 播放栏上的列表开关按钮自己处理开关，否则会先被关闭再被点开
			if (target.closest("[data-amll-playlist-toggle]")) return;
			onClose();
		};

		document.addEventListener("pointerdown", handlePointerDown, true);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown, true);
		};
	}, [onClose]);

	const rowVirtualizer = useVirtualizer({
		count: playlist.length,
		getScrollElement: () => playlistContainerRef.current,
		estimateSize: () => QUEUE_ROW_HEIGHT,
		overscan: 5,
	});

	useEffect(() => {
		if (
			rowVirtualizer &&
			playlistIndex >= 0 &&
			playlistIndex < playlist.length
		) {
			rowVirtualizer.scrollToIndex(playlistIndex, { align: "center" });
		}
	}, [playlistIndex, rowVirtualizer, playlist.length]);

	return (
		<Flex
			direction="column"
			maxWidth="400px"
			maxHeight="500px"
			data-amll-theme={isDarkTheme ? "dark" : "light"}
			className={classNames(styles.card, className)}
			ref={cardRef}
			style={{
				height: "50vh",
				width: "max(10vw, 50vh)",
				backdropFilter: "blur(1em)",
			}}
			{...props}
		>
			<Flex py="3" px="4" align="center" gap="2">
				<Text size="2" weight="medium" style={{ flexGrow: 1 }}>
					<Trans i18nKey="playbar.playlist.title">当前播放列表</Trans>
				</Text>
				{onClose && (
					<IconButton
						variant="ghost"
						color="gray"
						size="1"
						title={t("playbar.playlist.close", "关闭播放列表")}
						aria-label={t("playbar.playlist.close", "关闭播放列表")}
						onClick={onClose}
					>
						<Cross2Icon />
					</IconButton>
				)}
			</Flex>
			<Inset
				clip="padding-box"
				side="bottom"
				pb="current"
				style={{ overflowY: "auto" }}
				ref={playlistContainerRef}
			>
				<div
					style={{
						height: `${rowVirtualizer.getTotalSize()}px`,
						width: "100%",
						position: "relative",
					}}
				>
					{rowVirtualizer.getVirtualItems().map((virtualItem) => {
						const song = playlist[virtualItem.index];
						if (!song) return null;
						return (
							<PlaylistSongItem
								key={virtualItem.key}
								style={{
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									height: `${virtualItem.size}px`,
									transform: `translateY(${virtualItem.start}px)`,
								}}
								song={song}
								index={virtualItem.index}
								total={playlist.length}
							/>
						);
					})}
				</div>
			</Inset>
		</Flex>
	);
};
