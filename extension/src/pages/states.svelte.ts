import Browser from "webextension-polyfill";
import { BrowserStorage } from "@root/background/Entities/Static/Storage";
import { tick } from "svelte";
import { debounceFunc } from "@root/utils";

let workspaces = $state<Ext.Workspace[]>([]);
let homeWorkspace = $state<Ext.SimpleWorkspace>();
let defaultWorkspaces = $state<Ext.SimpleWorkspace[]>([]);
let windowId = $state<number>();
let theme = $state<"browser" | "">("");
let systemTheme = $state<"dark" | "light">("dark");
let forceDefaultThemeIfDarkMode = $state<boolean>(false);
const activeWorkspaceIndex = (() => {
	let value = $state(0);
	return {
		get value() {
			return value;
		},
		set value(i: number) {
			value = i;
		},
	};
})();
let keepPinnedTabs = $state<boolean>(false);

export const getWorkspacesState = () => workspaces;
export const getDefaultWorkspacesState = () => defaultWorkspaces;
export const getHomeWorkspaceState = () => homeWorkspace;
export const getThemeState = () => theme;
export const getForceDefaultThemeIfDarkModeState = () =>
	forceDefaultThemeIfDarkMode;
export const getSystemThemeState = () => systemTheme;
export const getActiveWorkspaceIndexState = () => activeWorkspaceIndex.value;
export const setActiveWorkspaceIndexState = (i: number) =>
	(activeWorkspaceIndex.value = i);
export const getKeepPinnedTabs = () => keepPinnedTabs;

function addedWorkspace({ workspace }: { workspace: Ext.Workspace }) {
	console.info("states: addedWorkspace");
	workspaces.push(workspace);
	updatedActiveWorkspace({ UUID: workspace.UUID });
}

function updatedHomeWorkspace({
	homeWorkspace: _homeWorkspace,
}: {
	homeWorkspace: Ext.SimpleWorkspace;
}) {
	console.info("states: updatedHomeWorkspace in window: " + windowId);
	homeWorkspace = _homeWorkspace;
	workspaces[0] = { ...workspaces[0], ...homeWorkspace };
}

const setWorkspaces = debounceFunc(_setWorkspaces, 100);

async function _setWorkspaces() {
	console.info("states: setWorkspaces 1 in window: " + windowId);
	const _workspaces =
		(await Browser.runtime.sendMessage({
			msg: "getWorkspaces",
			windowId,
		})) || [];
	console.info(
		"states: setWorkspaces in window: " + windowId,
		workspaces,
		_workspaces
	);

	workspaces = _workspaces;

	const _activeWorkspaceIndex = workspaces.findIndex(({ active }) => active);
	_activeWorkspaceIndex > -1 &&
		(activeWorkspaceIndex.value = _activeWorkspaceIndex);
	console.info({ windowId, _activeWorkspaceIndex });
}

async function setHomeWorkspace() {
	console.info("states: setHomeWorkspace");
	homeWorkspace = (await BrowserStorage.getHomeWorkspace())?.homeWorkspace || {
		id: -1,
		icon: "🏠",
		name: "Home",
	};
}

const addIdToSimpleWorkspace = (workspace: Ext.SimpleWorkspace, i: number) => {
	workspace.id = i;
	return workspace;
};

function updatedDefaultWorkspaces({
	defaultWorkspaces: _defaultWorkspaces,
}: {
	defaultWorkspaces: Ext.SimpleWorkspace[];
}) {
	console.info("states: updatedDefaultWorkspaces");
	defaultWorkspaces = _defaultWorkspaces.map(addIdToSimpleWorkspace);
}

async function setDefaultWorkspacesFromLocalStorage() {
	defaultWorkspaces =
		(await BrowserStorage.getDefaultWorkspaces())?.defaultWorkspaces?.map(
			addIdToSimpleWorkspace
		) || [];
}

const findActiveWorkspace = (workspace: Ext.Workspace) => workspace.active;

const updatedActiveWorkspace = debounceFunc(_updatedActiveWorkspace, 100);

function _updatedActiveWorkspace({
	UUID: workspaceUUID,
	sourcePage,
}: {
	UUID: Ext.Workspace["UUID"];
	sourcePage: "sidebar" | "popup";
}) {
	console.info("states: updatedActiveWorkspace in window + " + windowId);

	console.info({
		sourcePage,
		body: document.body,
		id: document.body.id,
		return: document.body.id === `${sourcePage}-page`,
	});

	if (sourcePage && document.body.id === `${sourcePage}-page`) return;

	const _activeWorkspaceIndex = workspaces.findIndex(
		({ UUID }) => UUID === workspaceUUID
	);

	console.info({ _activeWorkspaceIndex });

	if (_activeWorkspaceIndex < 0) return;
	activeWorkspaceIndex.value = _activeWorkspaceIndex;
	const activeWorkspace = workspaces.find(({ active }) => active);

	console.info({ workspaceUUID, _activeWorkspaceIndex, activeWorkspace });

	if (activeWorkspace) {
		activeWorkspace.active = false;
		const workspace = workspaces.find(({ UUID }) => UUID === workspaceUUID)!;
		(workspace as Ext.Workspace).active = true;
	}
}

function movedTabs({
	targetWorkspaceUUID,
	tabIds,
}: {
	targetWorkspaceUUID: string;
	tabIds: number[];
}) {
	const targetWorkspace = workspaces.find(
		({ UUID }) => UUID === targetWorkspaceUUID
	)!;

	const activeWorkspace = workspaces.find(findActiveWorkspace);

	if (activeWorkspace) {
		activeWorkspace.tabIds = activeWorkspace.tabIds.filter(
			(tabId) => !tabIds.includes(tabId)
		);

		if (!activeWorkspace.tabIds.length) {
			console.info("habe keine Tabs mehr :(", { activeWorkspace });
			updatedActiveWorkspace({ UUID: targetWorkspace.UUID });
		}
	}

	targetWorkspace.tabIds.push(...tabIds);
}

function movedTabsToNewWorkspace({ workspace }: { workspace: Ext.Workspace }) {
	workspaces.push(workspace);
}

async function setTheme() {
	const { theme: _theme } = await BrowserStorage.getTheme();
	theme = _theme || "";
}

function updatedTheme({ theme: _theme }: { theme: typeof theme }) {
	theme = _theme || "";
}

async function themeChanged() {
	console.info("themeChanged");
	if (theme === "browser") {
		theme = "";
		await tick();
		theme = "browser";
	}
}

async function setSystemTheme() {
	const _systemTheme = await Browser.runtime.sendMessage({
		msg: "getSystemTheme",
		windowId,
	});

	systemTheme = _systemTheme;
}

function systemThemeChanged({ theme: _theme }: { theme: "dark" | "light" }) {
	systemTheme = _theme;
}

async function setForceDefaultThemeIfDarkMode() {
	const { forceDefaultThemeIfDarkMode: _forceDefaultThemeIfDarkMode } =
		await BrowserStorage.getForceDefaultThemeIfDarkMode();
	forceDefaultThemeIfDarkMode = _forceDefaultThemeIfDarkMode;
}

function forceDefaultThemeIfDarkModeChanged({ bool }: { bool: boolean }) {
	forceDefaultThemeIfDarkMode = bool;
}

async function setKeepPinnedTabs() {
	const { keepPinnedTabs: _keepPinnedTabs } =
		await BrowserStorage.getKeepPinnedTabs();
	keepPinnedTabs = _keepPinnedTabs;
}

Browser.runtime.onMessage.addListener((message) => {
	console.info("browser runtime onmessage hehe");

	console.info({ message });
	const { windowId: targetWindowId, msg } = message;
	if (targetWindowId !== windowId) return;

	switch (msg) {
		case "addedWorkspace":
			addedWorkspace(message);
			break;
		case "updatedHomeWorkspace":
			updatedHomeWorkspace(message);
			break;
		case "updatedWorkspaces":
			setWorkspaces();
			break;
		case "updatedActiveWorkspace":
			updatedActiveWorkspace(message);
			break;
		case "movedTabs":
			movedTabs(message);
			break;
		case "movedTabsToNewWorkspace":
			movedTabsToNewWorkspace(message);
			break;
		case "updatedDefaultWorkspaces":
			updatedDefaultWorkspaces(message);
			break;
		case "updatedTheme":
			updatedTheme(message);
			break;
		case "themeChanged":
			themeChanged();
			break;
		case "systemThemeChanged":
			systemThemeChanged(message);
			break;
		case "forceDefaultThemeIfDarkModeChanged":
			forceDefaultThemeIfDarkModeChanged(message);
			break;
		default:
			break;
	}
});

export async function initView() {
	console.info("states: initView");
	windowId = (await Browser.windows.getCurrent()).id!;
	console.info("states: windowId -> " + windowId);

	await Browser.runtime.sendMessage({ msg: "awaitBackgroundInit" });

	await Promise.all([
		setWorkspaces(),
		setDefaultWorkspacesFromLocalStorage(),
		setHomeWorkspace(),
		setSystemTheme(),
		setTheme(),
		setKeepPinnedTabs(),
		setForceDefaultThemeIfDarkMode(),
	]);
}

// $effect.root(() => {
// 	console.info("effect.root");

// 	$effect(() => {
// 		(async () => {
// 			console.info("cooler effekt");
// 	});
// });
