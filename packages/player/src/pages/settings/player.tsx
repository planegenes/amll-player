import { branch, commit } from "virtual:git-metadata-plugin";
import {
	BACKGROUND_RENDERERS,
	CSS_BACKGROUND_RENDERER_ID,
	cssBackgroundPropertyAtom,
	DEFAULT_BACKGROUND_RENDERER_ID,
	enableLyricLineBlurEffectAtom,
	enableLyricLineScaleEffectAtom,
	enableLyricLineSpringAnimationAtom,
	enableLyricRomanLineAtom,
	enableLyricSwapTransRomanLineAtom,
	enableLyricTranslationLineAtom,
	fftDataRangeAtom,
	LYRIC_BACKGROUND_RENDERER_STORAGE_KEY,
	LyricSizePreset,
	lyricBackgroundFPSAtom,
	lyricBackgroundRendererAtom,
	lyricBackgroundRenderScaleAtom,
	lyricBackgroundStaticModeAtom,
	lyricFontFamilyAtom,
	lyricFontWeightAtom,
	lyricLetterSpacingAtom,
	lyricSizePresetAtom,
	lyricWordFadeWidthAtom,
	PlayerControlsType,
	playerControlsTypeAtom,
	resolveBackgroundRenderer,
	showBottomControlAtom,
	showMusicAlbumAtom,
	showMusicArtistsAtom,
	showMusicNameAtom,
	showVolumeControlAtom,
	VerticalCoverLayout,
	verticalCoverLayoutAtom,
} from "@applemusic-like-lyrics/react-full";
import {
	Avatar,
	Box,
	Button,
	Card,
	Flex,
	Grid,
	IconButton,
	Select,
	Separator,
	Slider,
	type SliderProps,
	Switch,
	type SwitchProps,
	Text,
	TextField,
	type TextProps,
} from "@radix-ui/themes";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { platform } from "@tauri-apps/plugin-os";
import { PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import { atom, useAtom, useAtomValue, type WritableAtom } from "jotai";
import { loadable } from "jotai/utils";
import React, {
	type FC,
	type PropsWithChildren,
	type ReactNode,
	Suspense,
	useEffect,
	useLayoutEffect,
	useMemo,
	useState,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { uid } from "uid";
import { router } from "../../router.tsx";
import {
	availableLanguagesAtom,
	BottomLyricDisplayMode,
	bottomLyricAuthorLabelAtom,
	bottomLyricDisplayModeAtom,
	bottomLyricWriterLabelAtom,
	CustomBottomInfoType,
	type CustomBottomInfoItem,
	customBottomInfoItemsAtom,
	DarkMode,
	darkModeAtom,
	enableAlwaysOnTopAtom,
	enableMediaControlsAtom,
	enableTaskbarLyricAtom,
	languageAtom,
	MusicContextMode,
	musicContextModeAtom,
	optimizeCleanUnintentionalOverlapsAtom,
	optimizeNormalizeSpacesAtom,
	optimizeResetLineTimestampsAtom,
	optimizeSyncMainAndBackgroundLinesAtom,
	optimizeTryAdvanceStartTimeAtom,
	pauseAfterPlayEndAtom,
	romanizationFastTrackToleranceMsAtom,
	romanizationMinIouPercentAtom,
	showStatJSFrameAtom,
	taskbarLyricAlignSettingAtom,
	taskbarLyricModeSettingAtom,
	taskbarLyricThemeSettingAtom,
	updateInfoAtom,
} from "../../states/appAtoms.ts";
import { restartApp } from "../../utils/player.ts";
import styles from "./index.module.css";

const SettingEntry: FC<
	PropsWithChildren<{ label: string; description?: string }>
> = ({ label, description, children }) => {
	return (
		<Card mt="2">
			<Flex direction="row" align="center" gap="4" wrap="wrap">
				<Flex direction="column" flexGrow="1">
					<Text as="div">{label}</Text>
					<Text as="div" color="gray" size="2" className={styles.desc}>
						{description}
					</Text>
				</Flex>
				{children}
			</Flex>
		</Card>
	);
};

const NumberSettings: FC<
	{ configAtom: WritableAtom<number, [number], void> } & React.ComponentProps<
		typeof SettingEntry
	> &
		Omit<React.ComponentProps<typeof TextField.Root>, "value" | "onChange">
> = ({ label, description, configAtom, ...props }) => {
	const [value, setValue] = useAtom(configAtom);
	return (
		<SettingEntry label={label} description={description}>
			<TextField.Root
				{...props}
				style={{ minWidth: "10em" }}
				defaultValue={String(value)}
				onChange={(e) => setValue(e.currentTarget.valueAsNumber || 0)}
			/>
		</SettingEntry>
	);
};

const SwitchSettings: FC<
	{ configAtom: WritableAtom<boolean, [boolean], void> } & React.ComponentProps<
		typeof SettingEntry
	> &
		Omit<SwitchProps, "value" | "onChange">
> = ({ label, description, configAtom }) => {
	const [value, setValue] = useAtom(configAtom);
	return (
		<SettingEntry label={label} description={description}>
			<Switch checked={value} onCheckedChange={setValue} />
		</SettingEntry>
	);
};

/** 文本类型的设置项：输入内容直接写入 atom，留空时的语义由使用方决定 */
const TextSettings: FC<
	{ configAtom: WritableAtom<string, [string], void>; placeholder?: string } &
		React.ComponentProps<typeof SettingEntry>
> = ({ label, description, configAtom, placeholder }) => {
	const [value, setValue] = useAtom(configAtom);
	return (
		<SettingEntry label={label} description={description}>
			<TextField.Root
				style={{ minWidth: "12em", flex: "1 1 12em" }}
				placeholder={placeholder}
				value={value}
				onChange={(e) => setValue(e.currentTarget.value)}
			/>
		</SettingEntry>
	);
};

const SubTitle: FC<PropsWithChildren<TextProps>> = ({ children, ...props }) => {
	return (
		<Text weight="bold" size="7" my="4" as="div" {...props}>
			{children}
		</Text>
	);
};

const SubHeading: FC<PropsWithChildren<TextProps>> = ({
	children,
	...props
}) => {
	return (
		<Text weight="bold" size="4" mt="4" mb="2" as="div" {...props}>
			{children}
		</Text>
	);
};

/** 同时提供滑块与数字输入框的设置项，两者保持同步 */
const SliderNumberSettings: FC<{
	configAtom: WritableAtom<number, [number], void>;
	label: string;
	description?: string;
	min: number;
	max: number;
	step?: number;
	suffix?: string;
}> = ({ configAtom, label, description, min, max, step = 1, suffix }) => {
	const [value, setValue] = useAtom(configAtom);
	const clamped = Math.min(max, Math.max(min, value));
	const [draft, setDraft] = useState(String(clamped));

	useEffect(() => {
		setDraft(String(clamped));
	}, [clamped]);

	return (
		<SettingEntry label={label} description={description}>
			<Flex align="center" gap="3" style={{ minWidth: "20em" }}>
				<Slider
					value={[clamped]}
					min={min}
					max={max}
					step={step}
					style={{ flexGrow: 1, minWidth: "8em" }}
					onValueChange={([v]) => setValue(v)}
				/>
				<TextField.Root
					type="number"
					min={min}
					max={max}
					step={step}
					value={draft}
					style={{ width: "6em" }}
					onChange={(e) => {
						const raw = e.currentTarget.value;
						setDraft(raw);
						const next = e.currentTarget.valueAsNumber;
						if (Number.isNaN(next)) return;
						setValue(Math.min(max, Math.max(min, next)));
					}}
					aria-label={label}
				/>
				{suffix && (
					<Text size="2" color="gray">
						{suffix}
					</Text>
				)}
			</Flex>
		</SettingEntry>
	);
};

const LyricFontSetting: FC = () => {
	const [fontFamily, setFontFamily] = useAtom(lyricFontFamilyAtom);
	const [fontWeight, setFontWeight] = useAtom(lyricFontWeightAtom);
	const [letterSpacing, setLetterSpacing] = useAtom(lyricLetterSpacingAtom);
	const [preview, setPreview] = useState("字体预览 Font Preview");
	const { t } = useTranslation();

	useLayoutEffect(() => {
		setPreview(
			t(
				"page.settings.lyricFont.fontPreview.defaultText",
				"字体预览 Font Preview",
			),
		);
	}, [t]);

	return (
		<Card mt="2">
			<Flex direction="row" align="center" gap="4">
				<Flex direction="column" flexGrow="1">
					<Text as="div">
						<Trans i18nKey="page.settings.lyricFont.subtitle">
							歌词字体设置
						</Trans>
					</Text>
					<Text as="div" color="gray" size="2" className={styles.desc}>
						<Trans i18nKey="page.settings.lyricFont.tip">
							此设置仅设置歌词字体，不包含其他组件的字体
						</Trans>
					</Text>
				</Flex>
			</Flex>
			<Flex direction="row" align="center" gap="4" my="2" wrap="wrap">
				<Flex direction="column" flexGrow="1">
					<Text as="div">
						<Trans i18nKey="page.settings.lyricFont.fontFamily.label">
							字体家族
						</Trans>
					</Text>
					<Text as="div" color="gray" size="2" className={styles.desc}>
						<Trans i18nKey="page.settings.lyricFont.fontFamily.description">
							以逗号分隔的字体名称组合，等同于 CSS 的 font-family
							属性，留空为默认
						</Trans>
					</Text>
				</Flex>
				<TextField.Root
					value={fontFamily}
					onChange={(e) => setFontFamily(e.currentTarget.value)}
				/>
			</Flex>
			<Flex direction="row" align="center" gap="4" my="2" wrap="wrap">
				<Flex direction="column" flexGrow="1">
					<Text as="div">
						<Trans i18nKey="page.settings.lyricFont.fontWeight.label">
							字体字重
						</Trans>
					</Text>
					<Text as="div" color="gray" size="2" className={styles.desc}>
						<Trans i18nKey="page.settings.lyricFont.fontWeight.description">
							等同于 CSS 的 font-weight 属性，设置 0 为系统控制，推荐值 600
						</Trans>
					</Text>
				</Flex>
				<TextField.Root
					value={fontWeight}
					type="number"
					min={0}
					max={1000}
					onChange={(e) => setFontWeight(e.currentTarget.valueAsNumber)}
				/>
				<Slider
					value={[Number(fontWeight)]}
					min={0}
					max={1000}
					style={{ maxWidth: "10em" }}
					onValueChange={([value]) => setFontWeight(value)}
				/>
			</Flex>
			<Flex direction="row" align="center" gap="4" my="2" wrap="wrap">
				<Flex direction="column" flexGrow="1">
					<Text as="div">
						<Trans i18nKey="page.settings.lyricFont.letterSpacing.label">
							字符间距
						</Trans>
					</Text>
					<Text as="div" color="gray" size="2" className={styles.desc}>
						<Trans i18nKey="page.settings.lyricFont.letterSpacing.description">
							等同于 CSS 的 letter-spacing 属性，留空为默认
						</Trans>
					</Text>
				</Flex>
				<TextField.Root
					value={letterSpacing}
					onChange={(e) => setLetterSpacing(e.currentTarget.value)}
				/>
			</Flex>
			<Flex direction="row" align="center" gap="4" my="2" wrap="wrap">
				<Flex direction="column" flexGrow="1">
					<Text as="div">
						<Trans i18nKey="page.settings.lyricFont.fontPreview.label">
							字体预览
						</Trans>
					</Text>
				</Flex>
				<TextField.Root
					value={preview}
					onChange={(e) => setPreview(e.currentTarget.value)}
				/>
			</Flex>
			<Box
				style={{
					fontFamily: fontFamily || undefined,
					fontWeight: fontWeight || undefined,
					letterSpacing: letterSpacing || undefined,
					fontSize: "max(max(4.7vh, 3.2vw), 12px)",
					textAlign: "center",
				}}
			>
				{preview}
				<Box style={{ fontSize: "max(0.5em, 10px)", opacity: "0.3" }}>
					{preview}
				</Box>
			</Box>
		</Card>
	);
};

const appVersionAtom = loadable(atom(() => getVersion()));

function SliderSettings<T extends number | number[]>({
	label,
	description,
	configAtom,
	children,
	...rest
}: PropsWithChildren<{ configAtom: WritableAtom<T, [T], void> }> &
	React.ComponentProps<typeof SettingEntry> &
	Omit<SliderProps, "value" | "onValueChange">): ReactNode {
	const [value, setValue] = useAtom(configAtom);
	return (
		<SettingEntry label={label} description={description}>
			<Slider
				value={typeof value === "number" ? [value] : value}
				onValueChange={(v: number[]) =>
					typeof value === "number" ? setValue(v[0] as T) : setValue(v as T)
				}
				{...rest}
			/>
			{children}
		</SettingEntry>
	);
}

const GeneralSettings = () => {
	const { t } = useTranslation();
	const [mode, setMode] = useAtom(darkModeAtom);
	const [language, setLanguage] = useAtom(languageAtom);
	const supportedLanguages = useAtomValue(availableLanguagesAtom);
	const [os, setOs] = useState<string | null>(null);

	useEffect(() => {
		setOs(platform());
	}, []);
	const themeMenu = useMemo(
		() => [
			{
				label: t("page.settings.general.theme.auto", "自动"),
				value: DarkMode.Auto,
			},
			{
				label: t("page.settings.general.theme.light", "浅色"),
				value: DarkMode.Light,
			},
			{
				label: t("page.settings.general.theme.dark", "深色"),
				value: DarkMode.Dark,
			},
		],
		[t],
	);

	return (
		<>
			<SubTitle>
				<Trans i18nKey="page.settings.general.subtitle">常规</Trans>
			</SubTitle>
			<SettingEntry
				label={t("page.settings.general.displayLanguage.label", "显示语言")}
			>
				<Select.Root value={language} onValueChange={setLanguage}>
					<Select.Trigger />
					<Select.Content>
						{supportedLanguages.map((item) => (
							<Select.Item key={item.value} value={item.value}>
								{item.label}
							</Select.Item>
						))}
					</Select.Content>
				</Select.Root>
			</SettingEntry>
			<SettingEntry
				label={t("page.settings.general.theme.label", "界面主题")}
				description={t(
					"page.settings.general.theme.description",
					"选择应用的外观主题",
				)}
			>
				<Select.Root value={mode} onValueChange={(v) => setMode(v as DarkMode)}>
					<Select.Trigger />
					<Select.Content>
						{themeMenu.map((item) => (
							<Select.Item key={item.value} value={item.value}>
								{item.label}
							</Select.Item>
						))}
					</Select.Content>
				</Select.Root>
			</SettingEntry>
			{os === "windows" && (
				<SwitchSettings
					label={t(
						"page.settings.general.windowAlwaysOnTop.label",
						"启用窗口置顶",
					)}
					description={t(
						"page.settings.general.windowAlwaysOnTop.description",
						"将应用窗口设置为始终置顶",
					)}
					configAtom={enableAlwaysOnTopAtom}
				/>
			)}
		</>
	);
};

const CustomBottomInfoSettings: FC = () => {
	const { t } = useTranslation();
	const [items, setItems] = useAtom(customBottomInfoItemsAtom);

	const itemTypeMenu = useMemo(
		() => [
			{
				label: t(
					"page.settings.lyricContent.customBottomInfo.type.text",
					"普通文本",
				),
				value: CustomBottomInfoType.Text,
			},
			{
				label: t(
					"page.settings.lyricContent.customBottomInfo.type.keyValue",
					"键值对",
				),
				value: CustomBottomInfoType.KeyValue,
			},
		],
		[t],
	);

	const updateItem = (id: string, patch: Partial<CustomBottomInfoItem>) => {
		setItems((prev) =>
			prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
		);
	};

	const removeItem = (id: string) => {
		setItems((prev) => prev.filter((item) => item.id !== id));
	};

	const addItem = () => {
		setItems((prev) => [
			...prev,
			{
				id: uid(16),
				type: CustomBottomInfoType.Text,
				key: "",
				value: "",
			},
		]);
	};

	return (
		<Card mt="2">
			<Flex direction="row" align="center" gap="4" wrap="wrap">
				<Flex direction="column" flexGrow="1">
					<Text as="div">
						<Trans i18nKey="page.settings.lyricContent.customBottomInfo.label">
							自定义显示信息
						</Trans>
					</Text>
					<Text as="div" color="gray" size="2" className={styles.desc}>
						<Trans i18nKey="page.settings.lyricContent.customBottomInfo.description">
							在底部信息下方追加自定义的显示内容，每一项独占一行
						</Trans>
					</Text>
				</Flex>
				<Button variant="soft" onClick={addItem}>
					<PlusIcon />
					{t(
						"page.settings.lyricContent.customBottomInfo.add",
						"添加一项",
					)}
				</Button>
			</Flex>
			{items.length === 0 && (
				<Text as="div" color="gray" size="2" mt="2" className={styles.desc}>
					<Trans i18nKey="page.settings.lyricContent.customBottomInfo.empty">
						尚未添加任何自定义信息
					</Trans>
				</Text>
			)}
			{items.map((item) => (
				<Box
					key={item.id}
					mt="2"
					p="2"
					style={{
						border: "1px solid var(--gray-a5)",
						borderRadius: "var(--radius-3)",
					}}
				>
					<Flex direction="row" align="center" gap="2" wrap="wrap">
						<Select.Root
							value={item.type}
							onValueChange={(v) =>
								updateItem(item.id, { type: v as CustomBottomInfoType })
							}
						>
							<Select.Trigger />
							<Select.Content>
								{itemTypeMenu.map((menuItem) => (
									<Select.Item key={menuItem.value} value={menuItem.value}>
										{menuItem.label}
									</Select.Item>
								))}
							</Select.Content>
						</Select.Root>
						<Box flexGrow="1" />
						<IconButton
							variant="ghost"
							color="gray"
							title={t(
								"page.settings.lyricContent.customBottomInfo.remove",
								"删除此项",
							)}
							aria-label={t(
								"page.settings.lyricContent.customBottomInfo.remove",
								"删除此项",
							)}
							onClick={() => removeItem(item.id)}
						>
							<TrashIcon />
						</IconButton>
					</Flex>
					<Flex direction="row" align="center" gap="2" mt="2" wrap="wrap">
						{item.type === CustomBottomInfoType.KeyValue && (
							<TextField.Root
								style={{ flex: "1 1 10em", minWidth: "8em" }}
								placeholder={t(
									"page.settings.lyricContent.customBottomInfo.key.placeholder",
									"键名",
								)}
								value={item.key}
								onChange={(e) =>
									updateItem(item.id, { key: e.currentTarget.value })
								}
							/>
						)}
						<TextField.Root
							style={{ flex: "2 1 14em", minWidth: "8em" }}
							placeholder={t(
								"page.settings.lyricContent.customBottomInfo.value.placeholder",
								"内容",
							)}
							value={item.value}
							onChange={(e) =>
								updateItem(item.id, { value: e.currentTarget.value })
							}
						/>
					</Flex>
				</Box>
			))}
		</Card>
	);
};

const LyricContentSettings = () => {
	const { t } = useTranslation();

	const [bottomLyricDisplayMode, setBottomLyricDisplayMode] = useAtom(
		bottomLyricDisplayModeAtom,
	);

	const bottomLyricMenu = useMemo(
		() => [
			{
				label: t(
					"page.settings.lyricContent.bottomLyricMode.menu.none",
					"完全不显示",
				),
				value: BottomLyricDisplayMode.None,
			},
			{
				label: t(
					"page.settings.lyricContent.bottomLyricMode.menu.onlyLyricAuthors",
					"只显示歌词作者",
				),
				value: BottomLyricDisplayMode.OnlyLyricAuthors,
			},
			{
				label: t(
					"page.settings.lyricContent.bottomLyricMode.menu.onlySongWriters",
					"只显示创作者",
				),
				value: BottomLyricDisplayMode.OnlySongWriters,
			},
			{
				label: t(
					"page.settings.lyricContent.bottomLyricMode.menu.preferLyricAuthors",
					"优先显示歌词作者",
				),
				value: BottomLyricDisplayMode.PreferLyricAuthors,
			},
			{
				label: t(
					"page.settings.lyricContent.bottomLyricMode.menu.preferSongWriters",
					"优先显示创作者",
				),
				value: BottomLyricDisplayMode.PreferSongWriters,
			},
		],
		[t],
	);

	return (
		<>
			<SubTitle>
				<Trans i18nKey="page.settings.lyricContent.subtitle">歌词内容</Trans>
			</SubTitle>
			<SwitchSettings
				label={t(
					"page.settings.lyricContent.enableLyricTranslationLine",
					"显示翻译歌词",
				)}
				configAtom={enableLyricTranslationLineAtom}
			/>
			<SwitchSettings
				label={t(
					"page.settings.lyricContent.enableLyricRomanLine.label",
					"显示音译歌词",
				)}
				configAtom={enableLyricRomanLineAtom}
			/>
			<SwitchSettings
				label={t(
					"page.settings.lyricContent.enableLyricSwapTransRomanLine.label",
					"启用音译歌词与翻译歌词互换",
				)}
				description={t(
					"page.settings.lyricContent.enableLyricSwapTransRomanLine.description",
					"仅上面两者启用后有效",
				)}
				configAtom={enableLyricSwapTransRomanLineAtom}
			/>

			<SubHeading>
				<Trans i18nKey="page.settings.lyricContent.romanizationMatch.subtitle">
					逐字音译匹配
				</Trans>
			</SubHeading>
			<SliderNumberSettings
				min={0}
				max={1000}
				step={1}
				suffix="ms"
				label={t(
					"page.settings.lyricContent.romanizationMatch.fastTrackTolerance.label",
					"快速通道容差",
				)}
				description={t(
					"page.settings.lyricContent.romanizationMatch.fastTrackTolerance.description",
					"主歌词字与音译音节的开始时间差在此范围内时直接配对，单位为毫秒。值越大越宽容，默认 2。",
				)}
				configAtom={romanizationFastTrackToleranceMsAtom}
			/>
			<SliderNumberSettings
				min={0}
				max={100}
				step={1}
				suffix="%"
				label={t(
					"page.settings.lyricContent.romanizationMatch.minIou.label",
					"最小交并比",
				)}
				description={t(
					"page.settings.lyricContent.romanizationMatch.minIou.description",
					"快速通道未命中时，按时间区间重合度取最接近的音译音节，重合度需达到此比例才会采用。值越小越容易匹配，但可能错位。默认 10%。",
				)}
				configAtom={romanizationMinIouPercentAtom}
			/>

			<Box height="1em" />
			<SettingEntry
				label={t(
					"page.settings.lyricContent.bottomLyricMode.label",
					"底部信息",
				)}
				description={t(
					"page.settings.lyricContent.bottomLyricMode.description",
					"控制歌词底部显示的歌曲创作者及歌词作者信息",
				)}
			>
				<Select.Root
					value={bottomLyricDisplayMode}
					onValueChange={(v) =>
						setBottomLyricDisplayMode(v as BottomLyricDisplayMode)
					}
				>
					<Select.Trigger />
					<Select.Content>
						{bottomLyricMenu.map((item) => (
							<Select.Item key={item.value} value={item.value}>
								{item.label}
							</Select.Item>
						))}
					</Select.Content>
				</Select.Root>
			</SettingEntry>
			<TextSettings
				label={t(
					"page.settings.lyricContent.bottomLyricAuthorLabel.label",
					"歌词作者字段显示名称",
				)}
				description={t(
					"page.settings.lyricContent.bottomLyricAuthorLabel.description",
					"歌词底部信息中「歌词作者」这一键名要显示的名称，留空则使用默认名称。",
				)}
				configAtom={bottomLyricAuthorLabelAtom}
				placeholder={t("bottom_lyric.lyricAuthor", "歌词作者")}
			/>
			<TextSettings
				label={t(
					"page.settings.lyricContent.bottomLyricWriterLabel.label",
					"创作者字段显示名称",
				)}
				description={t(
					"page.settings.lyricContent.bottomLyricWriterLabel.description",
					"歌词底部信息中「创作者」这一键名要显示的名称，留空则使用默认名称。",
				)}
				configAtom={bottomLyricWriterLabelAtom}
				placeholder={t("bottom_lyric.songWriter", "创作者")}
			/>
			<CustomBottomInfoSettings />
		</>
	);
};

const LyricAppearanceSettings = () => {
	const { t } = useTranslation();
	const [lyricSize, setLyricSize] = useAtom(lyricSizePresetAtom);

	const lyricSizeMenu = useMemo(
		() => [
			{
				label: t(
					"page.settings.lyricAppearance.lyricFontSize.menu.tiny",
					"超小",
				),
				value: LyricSizePreset.Tiny,
			},
			{
				label: t(
					"page.settings.lyricAppearance.lyricFontSize.menu.extra_small",
					"极小",
				),
				value: LyricSizePreset.ExtraSmall,
			},
			{
				label: t(
					"page.settings.lyricAppearance.lyricFontSize.menu.small",
					"小",
				),
				value: LyricSizePreset.Small,
			},
			{
				label: t(
					"page.settings.lyricAppearance.lyricFontSize.menu.medium",
					"中",
				),
				value: LyricSizePreset.Medium,
			},
			{
				label: t(
					"page.settings.lyricAppearance.lyricFontSize.menu.large",
					"大",
				),
				value: LyricSizePreset.Large,
			},
			{
				label: t(
					"page.settings.lyricAppearance.lyricFontSize.menu.extra_large",
					"极大",
				),
				value: LyricSizePreset.ExtraLarge,
			},
			{
				label: t(
					"page.settings.lyricAppearance.lyricFontSize.menu.huge",
					"超大",
				),
				value: LyricSizePreset.Huge,
			},
		],
		[t],
	);

	return (
		<>
			<SubTitle>
				<Trans i18nKey="page.settings.lyricAppearance.subtitle">歌词样式</Trans>
			</SubTitle>
			<LyricFontSetting />
			<SettingEntry
				label={t(
					"page.settings.lyricAppearance.lyricFontSize.label",
					"歌词字体大小",
				)}
				description={t(
					"page.settings.lyricAppearance.lyricFontSize.descriptionResponsive",
					"设置歌词的字体大小",
				)}
			>
				<Select.Root
					value={lyricSize}
					onValueChange={(value) => setLyricSize(value as LyricSizePreset)}
				>
					<Select.Trigger />
					<Select.Content>
						{lyricSizeMenu.map((item) => (
							<Select.Item key={item.value} value={item.value}>
								{item.label}
							</Select.Item>
						))}
					</Select.Content>
				</Select.Root>
			</SettingEntry>
			<SwitchSettings
				label={t(
					"page.settings.lyricAppearance.enableLyricLineBlurEffect.label",
					"启用歌词模糊效果",
				)}
				description={t(
					"page.settings.lyricAppearance.enableLyricLineBlurEffect.description",
					"对性能影响较高，如果遇到性能问题，可以尝试关闭此项。默认开启。",
				)}
				configAtom={enableLyricLineBlurEffectAtom}
			/>
			<SwitchSettings
				label={t(
					"page.settings.lyricAppearance.enableLyricLineScaleEffect.label",
					"启用歌词缩放效果",
				)}
				description={t(
					"page.settings.lyricAppearance.enableLyricLineScaleEffect.description",
					"对性能无影响，非当前播放歌词行会略微缩小。默认开启",
				)}
				configAtom={enableLyricLineScaleEffectAtom}
			/>
			<SwitchSettings
				label={t(
					"page.settings.lyricAppearance.enableLyricLineSpringAnimation.label",
					"启用歌词行弹簧动画效果",
				)}
				description={t(
					"page.settings.lyricAppearance.enableLyricLineSpringAnimation.description",
					"对性能影响较高，如果遇到性能问题，可以尝试关闭此项。默认开启。",
				)}
				configAtom={enableLyricLineSpringAnimationAtom}
			/>
			<NumberSettings
				placeholder="0.5"
				type="number"
				min="0"
				max="10.0"
				step="0.01"
				label={t(
					"page.settings.lyricAppearance.lyricWordFadeWidth.label",
					"逐词渐变宽度",
				)}
				description={t(
					"page.settings.lyricAppearance.lyricWordFadeWidth.description",
					"调节逐词歌词时单词的渐变过渡宽度，单位为一个全角字的宽度，默认为 0.5。\n如果要模拟 Apple Music for Android 的效果，可以设置为 1。\n如果要模拟 Apple Music for iPad 的效果，可以设置为 0.5。\n如需关闭逐词歌词时单词的渐变过渡效果，可以设置为 0。",
				)}
				configAtom={lyricWordFadeWidthAtom}
			/>
			<SwitchSettings
				label={t(
					"page.settings.lyricAppearance.optimize.normalizeSpaces.label",
					"规范化歌词空格",
				)}
				description={t(
					"page.settings.lyricAppearance.optimize.normalizeSpaces.description",
					"将歌词中多个连续空格替换为一个空格，让排版更整齐。默认开启。",
				)}
				configAtom={optimizeNormalizeSpacesAtom}
			/>
			<SwitchSettings
				label={t(
					"page.settings.lyricAppearance.optimize.resetLineTimestamps.label",
					"同步行级时间戳到字级",
				)}
				description={t(
					"page.settings.lyricAppearance.optimize.resetLineTimestamps.description",
					"将歌词行的起止时间强制设为该行首尾歌词字的时间戳，主要给 TTML 解析器打补丁。默认开启。",
				)}
				configAtom={optimizeResetLineTimestampsAtom}
			/>
			<SwitchSettings
				label={t(
					"page.settings.lyricAppearance.optimize.syncMainAndBackgroundLines.label",
					"同步主歌词与背景人声时间",
				)}
				description={t(
					"page.settings.lyricAppearance.optimize.syncMainAndBackgroundLines.description",
					"取主歌词与其背景人声中最早的开始时间和最晚的结束时间，应用给双方。默认开启。",
				)}
				configAtom={optimizeSyncMainAndBackgroundLinesAtom}
			/>
			<SwitchSettings
				label={t(
					"page.settings.lyricAppearance.optimize.cleanUnintentionalOverlaps.label",
					"清洗非刻意的时间重叠",
				)}
				description={t(
					"page.settings.lyricAppearance.optimize.cleanUnintentionalOverlaps.description",
					"若相邻两行时间轴存在非刻意的重叠，则截断上一行结束时间，避免不必要的多行高亮。默认开启。",
				)}
				configAtom={optimizeCleanUnintentionalOverlapsAtom}
			/>
			<SwitchSettings
				label={t(
					"page.settings.lyricAppearance.optimize.tryAdvanceStartTime.label",
					"提前歌词行开始时间",
				)}
				description={t(
					"page.settings.lyricAppearance.optimize.tryAdvanceStartTime.description",
					"尝试让歌词行提前开始，以便歌词滚动到位后刚好播放逐词效果；有重叠时会减少提前量。更接近 Apple Music 的效果，但可能导致歌词行末尾尚未播放完就切换到下一行。默认开启。",
				)}
				configAtom={optimizeTryAdvanceStartTimeAtom}
			/>
		</>
	);
};

const MusicInfoAppearanceSettings = () => {
	const { t } = useTranslation();
	const fftDataRange = useAtomValue(fftDataRangeAtom);
	const [playerControlsType, setPlayerControlsType] = useAtom(
		playerControlsTypeAtom,
	);
	const [verticalCoverLayout, setVerticalCoverLayout] = useAtom(
		verticalCoverLayoutAtom,
	);

	const playerControlsTypeMenu = useMemo(
		() => [
			{
				label: t(
					"page.settings.musicInfoAppearance.playerControlsType.menu.controls",
					"播放控制组件",
				),
				value: PlayerControlsType.Controls,
			},
			{
				label: t(
					"page.settings.musicInfoAppearance.playerControlsType.menu.fft",
					"线条音频可视化",
				),
				value: PlayerControlsType.FFT,
			},
			{
				label: t(
					"page.settings.musicInfoAppearance.playerControlsType.menu.none",
					"无",
				),
				value: PlayerControlsType.None,
			},
		],
		[t],
	);
	const verticalCoverLayoutMenu = useMemo(
		() => [
			{
				label: t(
					"page.settings.musicInfoAppearance.verticalCoverLayout.menu.auto",
					"自动",
				),
				value: VerticalCoverLayout.Auto,
			},
			{
				label: t(
					"page.settings.musicInfoAppearance.verticalCoverLayout.menu.forceNormal",
					"强制默认布局",
				),
				value: VerticalCoverLayout.ForceNormal,
			},
			{
				label: t(
					"page.settings.musicInfoAppearance.verticalCoverLayout.menu.forceImmersive",
					"强制沉浸布局",
				),
				value: VerticalCoverLayout.ForceImmersive,
			},
		],
		[t],
	);

	return (
		<>
			<SubTitle>
				<Trans i18nKey="page.settings.musicInfoAppearance.subtitle">
					歌曲信息样式
				</Trans>
			</SubTitle>
			<SwitchSettings
				label={t(
					"page.settings.musicInfoAppearance.showMusicName.label",
					"显示歌曲名称",
				)}
				configAtom={showMusicNameAtom}
			/>
			<SwitchSettings
				label={t(
					"page.settings.musicInfoAppearance.showMusicArtists.label",
					"显示歌曲作者",
				)}
				configAtom={showMusicArtistsAtom}
			/>
			<SwitchSettings
				label={t(
					"page.settings.musicInfoAppearance.showMusicAlbum.label",
					"显示歌曲专辑名称",
				)}
				description={t(
					"page.settings.musicInfoAppearance.showMusicAlbum.description",
					"如果同时启用三个，布局上可能不太好看，请酌情调节。",
				)}
				configAtom={showMusicAlbumAtom}
			/>
			<Box height="1em" />
			<SwitchSettings
				label={t(
					"page.settings.musicInfoAppearance.showVolumeControl.label",
					"显示音量控制条",
				)}
				configAtom={showVolumeControlAtom}
			/>
			<SwitchSettings
				label={t(
					"page.settings.musicInfoAppearance.showBottomControl.label",
					"显示底部按钮组",
				)}
				description={t(
					"page.settings.musicInfoAppearance.showBottomControl.description",
					"在横向布局里是右下角的几个按钮，在竖向布局里是播放按钮下方的几个按钮",
				)}
				configAtom={showBottomControlAtom}
			/>
			<Box height="1em" />
			<SettingEntry
				label={t(
					"page.settings.musicInfoAppearance.playerControlsType.label",
					"播放控制组件类型",
				)}
				description={t(
					"page.settings.musicInfoAppearance.playerControlsType.description",
					"即歌曲信息下方的组件",
				)}
			>
				<Select.Root
					value={playerControlsType}
					onValueChange={(v) => setPlayerControlsType(v as PlayerControlsType)}
				>
					<Select.Trigger />
					<Select.Content>
						{playerControlsTypeMenu.map((item) => (
							<Select.Item key={item.value} value={item.value}>
								{item.label}
							</Select.Item>
						))}
					</Select.Content>
				</Select.Root>
			</SettingEntry>
			<Box height="1em" />
			<SettingEntry
				label={t(
					"page.settings.musicInfoAppearance.verticalCoverLayout.label",
					"垂直布局专辑图布局模式",
				)}
				description={t(
					"page.settings.musicInfoAppearance.verticalCoverLayout.description",
					"在隐藏歌词的情况下专辑图的布局方式：\n- 自动：根据专辑图是否为视频以使用沉浸布局\n- 强制默认布局：强制使用默认的专辑图布局\n- 强制沉浸布局：强制使用沉浸式的专辑图布局",
				)}
			>
				<Select.Root
					value={verticalCoverLayout}
					onValueChange={(v) =>
						setVerticalCoverLayout(v as VerticalCoverLayout)
					}
				>
					<Select.Trigger />
					<Select.Content>
						{verticalCoverLayoutMenu.map((item) => (
							<Select.Item key={item.value} value={item.value}>
								{item.label}
							</Select.Item>
						))}
					</Select.Content>
				</Select.Root>
			</SettingEntry>
			<SliderSettings
				label={t(
					"page.settings.musicInfoAppearance.fftDataRange.label",
					"音频可视化频域范围",
				)}
				description={t(
					"page.settings.musicInfoAppearance.fftDataRange.description",
					"单位为赫兹（hz），此项会影响音频可视化和背景跳动效果的展示效果",
				)}
				configAtom={fftDataRangeAtom}
				min={1}
				max={22050}
			>
				<Text wrap="nowrap">
					{fftDataRange[0]} Hz - {fftDataRange[1]} Hz
				</Text>
			</SliderSettings>
		</>
	);
};

const LyricBackgroundSettings = () => {
	const { t } = useTranslation();
	const [backgroundRendererValue, setBackgroundRendererValue] = useAtom(
		lyricBackgroundRendererAtom,
	);
	const [cssBackgroundProperty, setCssBackgroundProperty] = useAtom(
		cssBackgroundPropertyAtom,
	);
	const backgroundRendererMenu = useMemo(
		() => [
			{
				label: t(
					"page.settings.lyricBackground.menu.meshGradientRenderer",
					"网格渐变渲染器",
				),
				value: DEFAULT_BACKGROUND_RENDERER_ID,
			},
			{
				label: t(
					"page.settings.lyricBackground.menu.pixiRenderer",
					"PixiJS 渲染器",
				),
				value: "pixi",
			},
			{
				label: t(
					"page.settings.lyricBackground.menu.titaniumRenderer",
					"钛金属流沙渲染器",
				),
				value: "titanium",
			},
			{
				label: t(
					"page.settings.lyricBackground.menu.cssBackground",
					"CSS 背景",
				),
				value: CSS_BACKGROUND_RENDERER_ID,
			},
		],
		[t],
	);

	const selectedRendererId =
		backgroundRendererMenu.find(
			({ value }) =>
				(BACKGROUND_RENDERERS[value]?.renderer ?? value) ===
				backgroundRendererValue.renderer,
		)?.value ?? DEFAULT_BACKGROUND_RENDERER_ID;

	const handleBackgroundRendererChange = (id: string) => {
		setBackgroundRendererValue({ renderer: resolveBackgroundRenderer(id) });
		localStorage.setItem(LYRIC_BACKGROUND_RENDERER_STORAGE_KEY, id);
	};

	return (
		<>
			<SubTitle>
				<Trans i18nKey="page.settings.lyricBackground.subtitle">歌词背景</Trans>
			</SubTitle>
			<SettingEntry
				label={t(
					"page.settings.lyricBackground.backgroundRenderer.label",
					"背景渲染器",
				)}
			>
				<Select.Root
					value={selectedRendererId}
					onValueChange={handleBackgroundRendererChange}
				>
					<Select.Trigger />
					<Select.Content>
						{backgroundRendererMenu.map((item) => (
							<Select.Item
								key={item.value}
								value={item.value}
								disabled={
									BACKGROUND_RENDERERS[item.value]?.isSupported() === false
								}
							>
								{item.label}
							</Select.Item>
						))}
					</Select.Content>
				</Select.Root>
			</SettingEntry>

			{selectedRendererId === CSS_BACKGROUND_RENDERER_ID ? (
				<SettingEntry
					label={t(
						"page.settings.lyricBackground.lyricBackgroundColor.label",
						"CSS 背景属性值",
					)}
					description={t(
						"page.settings.lyricBackground.lyricBackgroundColor.description",
						"等同于放入 background 样式的字符串值，默认为 #111111",
					)}
				>
					<TextField.Root
						value={cssBackgroundProperty}
						onChange={(e) => setCssBackgroundProperty(e.currentTarget.value)}
					/>
				</SettingEntry>
			) : (
				<>
					<NumberSettings
						placeholder="60"
						type="number"
						min="1"
						max="1000"
						step="1"
						label={t(
							"page.settings.lyricBackground.lyricBackgroundFPS.label",
							"背景最高帧数",
						)}
						description={t(
							"page.settings.lyricBackground.lyricBackgroundFPS.description",
							"对性能影响较高，但是实际开销不大，如果遇到性能问题，可以尝试降低此值。默认值为 60。",
						)}
						configAtom={lyricBackgroundFPSAtom}
					/>
					<NumberSettings
						placeholder="1.0"
						type="number"
						min="0.01"
						max="10.0"
						step="0.01"
						label={t(
							"page.settings.lyricBackground.lyricBackgroundRenderScale.label",
							"背景渲染倍率",
						)}
						description={t(
							"page.settings.lyricBackground.lyricBackgroundRenderScale.description",
							"对性能影响较高，但是实际开销不大，如果遇到性能问题，可以尝试降低此值。默认值为 1 即每像素点渲染。",
						)}
						configAtom={lyricBackgroundRenderScaleAtom}
					/>
					<SwitchSettings
						label={t(
							"page.settings.lyricBackground.lyricBackgroundStaticMode.label",
							"背景静态模式",
						)}
						description={t(
							"page.settings.lyricBackground.lyricBackgroundStaticMode.description",
							"让背景会在除了切换歌曲变换封面的情况下保持静止，如果遇到了性能问题，可以考虑开启此项。\n注意：启用此项会导致背景跳动效果失效。",
						)}
						configAtom={lyricBackgroundStaticModeAtom}
					/>
				</>
			)}
		</>
	);
};

const OthersSettings = () => {
	const { t } = useTranslation();
	const musicContextMode = useAtomValue(musicContextModeAtom);
	return (
		<>
			<SubTitle>
				<Trans i18nKey="page.settings.others.subtitle">杂项</Trans>
			</SubTitle>
			{musicContextMode === MusicContextMode.Local && (
				<SwitchSettings
					label={t(
						"page.settings.others.pauseAfterPlayEnd.label",
						"播放完毕后暂停",
					)}
					description={t(
						"page.settings.others.pauseAfterPlayEnd.description",
						"一首歌曲播放结束后不自动切换到下一首，而是停在当前歌曲并暂停播放。此选项优先于循环模式。",
					)}
					configAtom={pauseAfterPlayEndAtom}
				/>
			)}
			<SwitchSettings
				label={t(
					"page.settings.others.showStatJSFrame.label",
					"显示性能统计信息",
				)}
				description={t(
					"page.settings.others.showStatJSFrame.description",
					"可以看到帧率、帧时间、内存占用（仅 Chromuim 系）等信息，对性能影响较小。",
				)}
				configAtom={showStatJSFrameAtom}
			/>
			<SwitchSettings
				label={t(
					"page.settings.smtc.enableMediaControls.label",
					"启用内置播放器的媒体控件",
				)}
				description={t(
					"page.settings.smtc.enableMediaControls.description",
					"目前只支持 Windows 的 SMTC",
				)}
				configAtom={enableMediaControlsAtom}
			/>
			<Button my="2" onClick={() => restartApp()}>
				<Trans i18nKey="page.settings.others.restartProgram">重启程序</Trans>
			</Button>
			<Button
				m="2"
				variant="soft"
				onClick={() => {
					router.navigate("/amll-dev");
				}}
			>
				<Trans i18nKey="page.settings.others.enterAmllDevPage">
					歌词页面开发用工具
				</Trans>
			</Button>
		</>
	);
};

const TaskbarLyricSettings = () => {
	const { t } = useTranslation();
	const [enabled, setEnabled] = useAtom(enableTaskbarLyricAtom);
	const [themeSetting, setThemeSetting] = useAtom(taskbarLyricThemeSettingAtom);
	const [alignSetting, setAlignSetting] = useAtom(taskbarLyricAlignSettingAtom);
	const [modeSetting, setModeSetting] = useAtom(taskbarLyricModeSettingAtom);

	return (
		<>
			<SubTitle>
				{t("page.settings.taskbarLyric.subtitle", "任务栏歌词")}
			</SubTitle>
			<SettingEntry
				label={t("page.settings.taskbarLyric.enable.label", "启用任务栏歌词")}
				description={t(
					"page.settings.taskbarLyric.enable.description",
					"在 Windows 任务栏上显示当前播放的歌词",
				)}
			>
				<Switch checked={enabled} onCheckedChange={setEnabled} />
			</SettingEntry>

			<SettingEntry
				label={t("page.settings.taskbarLyric.theme.label", "主题设置")}
				description={t(
					"page.settings.taskbarLyric.theme.description",
					"覆盖任务栏歌词的颜色主题",
				)}
			>
				<Select.Root
					value={themeSetting}
					onValueChange={(v) => setThemeSetting(v as "auto" | "dark" | "light")}
				>
					<Select.Trigger />
					<Select.Content>
						<Select.Item value="auto">
							{t("page.settings.taskbarLyric.theme.auto", "跟随任务栏")}
						</Select.Item>
						<Select.Item value="light">
							{t("page.settings.taskbarLyric.theme.light", "浅色")}
						</Select.Item>
						<Select.Item value="dark">
							{t("page.settings.taskbarLyric.theme.dark", "深色")}
						</Select.Item>
					</Select.Content>
				</Select.Root>
			</SettingEntry>

			<SettingEntry
				label={t("page.settings.taskbarLyric.align.label", "对齐方向")}
				description={t(
					"page.settings.taskbarLyric.align.description",
					"任务栏歌词的对齐方向",
				)}
			>
				<Select.Root
					value={alignSetting}
					onValueChange={(v) => setAlignSetting(v as "auto" | "left" | "right")}
				>
					<Select.Trigger />
					<Select.Content>
						<Select.Item value="auto">
							{t("page.settings.taskbarLyric.align.auto", "自动")}
						</Select.Item>
						<Select.Item value="left">
							{t("page.settings.taskbarLyric.align.left", "左对齐")}
						</Select.Item>
						<Select.Item value="right">
							{t("page.settings.taskbarLyric.align.right", "右对齐")}
						</Select.Item>
					</Select.Content>
				</Select.Root>
			</SettingEntry>

			<SettingEntry
				label={t("page.settings.taskbarLyric.mode.label", "歌词行数")}
			>
				<Select.Root
					value={modeSetting}
					onValueChange={(v) =>
						setModeSetting(v as "auto" | "single" | "double")
					}
				>
					<Select.Trigger />
					<Select.Content>
						<Select.Item value="auto">
							{t("page.settings.taskbarLyric.mode.auto", "自动")}
						</Select.Item>
						<Select.Item value="single">
							{t("page.settings.taskbarLyric.mode.single", "单行模式")}
						</Select.Item>
						<Select.Item value="double">
							{t("page.settings.taskbarLyric.mode.double", "双行模式")}
						</Select.Item>
					</Select.Content>
				</Select.Root>
			</SettingEntry>

			{import.meta.env.DEV && (
				<Button
					my="2"
					variant="soft"
					onClick={() => invoke("open_taskbar_lyric_devtools")}
				>
					{t("page.settings.taskbarLyric.openDevtools", "打开 DevTools")}
				</Button>
			)}
		</>
	);
};

const openLink = async (url: string) => {
	if (!url) return;
	try {
		await openUrl(url);
	} catch {
		window.open(url, "_blank");
	}
};

interface Contributor {
	id: number;
	login: string;
	avatar: string;
	url: string;
}

const ContributorsSection: FC = () => {
	const { t } = useTranslation();
	const [contributors, setContributors] = useState<Contributor[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchData = async () => {
			try {
				const response = await fetch(
					"https://api.github.com/repos/amll-dev/amll-player/contributors?per_page=100&anon=true",
				);
				if (response.ok) {
					const data = await response.json();
					if (Array.isArray(data)) {
						const list: Contributor[] = data
							.filter(
								(item: any) =>
									item.login &&
									item.login !== "type-bot" &&
									item.type !== "Bot" &&
									!item.login.endsWith("[bot]"),
							)
							.map((item: any) => ({
								id: item.id,
								login: item.login,
								avatar: item.avatar_url || "",
								url: item.html_url || `https://github.com/${item.login}`,
							}));
						setContributors(list);
					}
				}
			} catch (error) {
				console.error("Failed to fetch contributors:", error);
			} finally {
				setLoading(false);
			}
		};

		fetchData();
	}, []);

	if (loading) {
		return (
			<Text color="gray" size="2" my="2" as="div">
				{t("page.about.loadingContributors", "正在加载贡献者列表…")}
			</Text>
		);
	}

	if (contributors.length === 0) {
		return null;
	}

	const renderContributorCard = (item: Contributor) => (
		<Card
			key={item.id}
			asChild
			style={{
				cursor: "pointer",
				textDecoration: "none",
				color: "inherit",
				maxWidth: "30rem",
			}}
		>
			<a
				href={item.url}
				target="_blank"
				rel="noopener noreferrer"
				onClick={(e) => {
					e.preventDefault();
					openLink(item.url);
				}}
			>
				<Flex align="center" gap="2">
					<Avatar
						size="2"
						radius="full"
						src={item.avatar}
						fallback={item.login.substring(0, 2).toUpperCase()}
					/>
					<Text weight="bold" size="2" truncate style={{ overflow: "hidden" }}>
						{item.login}
					</Text>
				</Flex>
			</a>
		</Card>
	);

	return (
		<Box my="4">
			<SubTitle my="2">
				{t("page.about.contributorsTitle", "贡献者")}
			</SubTitle>
			<Grid
				style={{ gridTemplateColumns: "repeat(auto-fill, minmax(20rem, 1fr))" }}
				gap="3"
				my="2"
			>
				{contributors.map(renderContributorCard)}
			</Grid>
		</Box>
	);
};

const AboutSettings = () => {
	const { t } = useTranslation();
	const updateInfo = useAtomValue(updateInfoAtom);
	const appVersion = useAtomValue(appVersionAtom);
	const [updating, setUpdating] = useState(false);

	return (
		<>
			<SubTitle>
				<Trans i18nKey="page.about.subtitle">关于</Trans>
			</SubTitle>
			<Text as="div">Apple Music-like Lyrics Player</Text>
			<Text as="div" style={{ opacity: "0.5" }}>
				{" "}
				{appVersion.state === "hasData" ? `${appVersion.data} - ` : ""}{" "}
				{commit.substring(0, 7)} - {branch}{" "}
			</Text>
			<Text as="div">
				<Trans i18nKey="page.about.credits">
					由 SteveXMH 及其所有 Github 协作者共同开发
				</Trans>
			</Text>
			<ContributorsSection />
			<Suspense>
				{updateInfo && (
					<>
						<Separator size="4" my="3" />
						<div id="updater">
							{t(
								"page.about.newVersion",
								"有可用更新从 {currentVersion} 升级至 {nextVersion}",
								{
									currentVersion: updateInfo.currentVersion,
									nextVersion: updateInfo.version,
								},
							)}
						</div>
						<div
							style={{
								margin: "1em 0",
								whiteSpace: "pre-wrap",
							}}
						>
							{updateInfo.body}
						</div>
						<Button
							disabled={updating}
							loading={updating}
							onClick={() => {
								setUpdating(true);
								const toastId = toast.loading(
									t(
										"page.about.updating",
										"正在更新，完成后将会自动重启，请稍后……",
									),
								);
								let contentLength: number | undefined;
								let receivedLength = 0;
								function getProgressSizeText() {
									const rec = `${(receivedLength / 1024 / 1024).toFixed(2)} MiB`;
									if (contentLength === undefined) {
										return `(${rec})`;
									}
									const total = `${(contentLength / 1024 / 1024).toFixed(
										2,
									)} MiB`;
									return `(${rec} / ${total}) (${(
										(receivedLength / contentLength) * 100
									).toFixed(1)}%)`;
								}
								const getDownloadMessage = (progressText: string) =>
									t("page.about.downloading", "正在下载更新…… {progressText}", {
										progressText,
									});
								updateInfo.downloadAndInstall((evt) => {
									switch (evt.event) {
										case "Started": {
											contentLength = evt.data.contentLength;
											toast.update(toastId, {
												render: getDownloadMessage(getProgressSizeText()),
											});
											break;
										}
										case "Progress": {
											receivedLength += evt.data.chunkLength;
											toast.update(toastId, {
												render: getDownloadMessage(getProgressSizeText()),
												progress:
													contentLength === undefined
														? null
														: receivedLength / contentLength,
											});
											break;
										}
										case "Finished":
											toast.update(toastId, {
												render: t(
													"page.about.installing",
													"正在安装更新，将会自动重启，请稍后……",
												),
												progress: null,
											});
											setTimeout(restartApp, 1000);
											break;
									}
								});
							}}
						>
							<Trans i18nKey="page.about.installUpdate">更新并安装</Trans>
						</Button>
						<Box mb="3" />
					</>
				)}
			</Suspense>
		</>
	);
};

export const PlayerSettingsTab: FC<{ category: string }> = ({ category }) => {
	switch (category) {
		case "general":
			return <GeneralSettings />;
		case "lyricContent":
			return <LyricContentSettings />;
		case "lyricAppearance":
			return <LyricAppearanceSettings />;
		case "musicInfoAppearance":
			return <MusicInfoAppearanceSettings />;
		case "lyricBackground":
			return <LyricBackgroundSettings />;
		case "others":
			return <OthersSettings />;
		case "taskbarLyric":
			return <TaskbarLyricSettings />;
		case "about":
			return <AboutSettings />;
		default:
			return null;
	}
};
