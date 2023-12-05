import browser from "webextension-polyfill";
import { TabMenu } from "./tabMenu";
import { WorkspaceStorage } from "./workspace-storage";

let workspaceStorage: WorkspaceStorage;
let tabMenu: TabMenu;

function initExtension() {
	return new Promise(async (resolve) => {
		await initWorkspaceStorage();
		await initTabMenu();
		return resolve(true);
	});
}

function initTabMenu() {
	return new Promise(async (resolve) => {
		tabMenu = new TabMenu();
		await tabMenu.init(
			workspaceStorage.windows.find(
				({ id }) => id === workspaceStorage.focusedWindowId
			)!.workspaces
		);
		return resolve(true);
	});
}

function initWorkspaceStorage() {
	return new Promise(async (resolve) => {
		console.info("bg - initWorkspaceStorage");
		workspaceStorage = new WorkspaceStorage();
		await workspaceStorage.init();
		return resolve(true);
	});
	// console.log({
	// 	workspaceStorage,
	// 	workspaces: workspaceStorage.workspaces,
	// 	activeWorkspace: workspaceStorage.activeWorkspace,
	// });
}

browser.runtime.onStartup.addListener(async () => {
	console.log("onStartup");
	if (!workspaceStorage) await initExtension();
});

let backgroundListenerPorts: {
	port: browser.Runtime.Port;
	windowId: number;
}[] = [];

browser.runtime.onConnect.addListener(async (port) => {
	console.log("onConnect - port:", port);
	backgroundListenerPorts.push({
		port,
		windowId: workspaceStorage.focusedWindowId,
	});

	port.onDisconnect.addListener((port) => {
		backgroundListenerPorts = backgroundListenerPorts.filter(
			({ port: _port }) => port !== _port
		);
	});
});

function informPorts() {
	backgroundListenerPorts.forEach(({ port, windowId }) => {
		if (windowId === workspaceStorage.focusedWindowId) {
			port.postMessage({ msg: "updated" });
		}
	});
}

browser.menus.onShown.addListener((info, tab) => {
	const workspaces = workspaceStorage.windows
		.find(({ id }) => id === tab.windowId)!
		.workspaces.filter((workspace) => workspace.windowId === tab!.windowId!);

	console.log({ workspaces, info, tab });

	tabMenu.update({
		workspaces,
	});
});

browser.menus.onClicked.addListener(async (info, tab) => {
	const { menuItemId: _menuItemId } = info;
	const menuItemId = _menuItemId.toString();
	if (menuItemId.toString().startsWith("workspace-menu")) {
		const targetWorkspaceId = menuItemId.split("_").at(1)!;

		// const activeTab = await browser.tabs.getCurrent();
		const highlightedTabIds = (
			await browser.tabs.query({
				windowId: tab!.windowId!,
				highlighted: true,
			})
		).map((tab) => tab.id!);

		const tabIds =
			highlightedTabIds.length > 1 ? highlightedTabIds : [tab!.id!];

		await workspaceStorage.moveTabs({
			tabIds,
			targetWorkspaceId,
			windowId: tab!.windowId!,
		});

		informPorts();
	}
});

browser.runtime.onInstalled.addListener((details) => {
	(async () => {
		if (!workspaceStorage) await initExtension();
	})();
});

browser.windows.onCreated.addListener((window) => {
	(async () => {
		workspaceStorage.addWindow(window.id!);
	})();
});

browser.windows.onFocusChanged.addListener((windowId) => {
	console.log("onFocusChanged", windowId);
	if (windowId !== browser.windows.WINDOW_ID_NONE) {
		workspaceStorage.focusedWindowId = windowId;
	}
});

browser.windows.onRemoved.addListener((windowId) => {
	workspaceStorage.removeWorkspaces({ windowId });
});

browser.tabs.onCreated.addListener((tab) => {
	console.info("tabs.onCreated: ", { tab });
	workspaceStorage.addTab(tab.id!, tab.windowId!);
	informPorts();
});

browser.tabs.onRemoved.addListener((tabId, info) => {
	workspaceStorage.removeTab(tabId, info.windowId);
	informPorts();
});

browser.tabs.onActivated.addListener((activeInfo) => {
	workspaceStorage.setActiveTab(activeInfo.tabId, activeInfo.windowId);
});

function getCurrentWindow() {
	return browser.windows.getCurrent();
}

browser.commands.onCommand.addListener((command) => {
	switch (command) {
		case "next-workspace":
			(async () => {
				await workspaceStorage.switchToNextWorkspace({
					windowId: (await getCurrentWindow()).id!,
				});
				informPorts();
			})();
			break;
		case "previous-workspace":
			(async () => {
				await workspaceStorage.switchToPreviousWorkspace({
					windowId: (await getCurrentWindow()).id!,
				});
				informPorts();
			})();
			break;
		case "new-workspace":
			(async () => {
				await workspaceStorage.addWorkspace();
				informPorts();
			})();
			break;
		default:
			break;
	}
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
	const { msg } = message;

	switch (msg) {
		case "clearDB":
			workspaceStorage.clearDB();
			break;
		case "addWorkspace":
			return workspaceStorage.addWorkspace();
		case "editWorkspace":
			return workspaceStorage.editWorkspace(message);
		case "getWorkspaces":
			return workspaceStorage.getWorkspaces(message);
		case "removeWorkspace":
			return workspaceStorage.removeWorkspace(message.workspaceId);
		case "reloadAllTabs":
			(async () => {
				const tabIds = (
					await browser.tabs.query({
						windowId: (await browser.windows.getCurrent()).id,
					})
				).map((tab) => tab.id!);

				tabIds.forEach((tabId) => browser.tabs.reload(tabId));
			})();
			break;
		case "showAllTabs":
			(async () => {
				const tabIds = (
					await browser.tabs.query({
						windowId: (await browser.windows.getCurrent()).id,
					})
				).map((tab) => tab.id!);

				browser.tabs.show(tabIds);
			})();
			break;
		case "getCurrentTabIds":
			return new Promise(async (resolve) => {
				const tabIds = (
					await browser.tabs.query({
						windowId: (await browser.windows.getCurrent()).id,
					})
				).map((tab) => tab.id);
				return resolve(tabIds);
			});
		case "switchWorkspace":
			const { workspaceId } = message as { workspaceId: string };
			const nextWorkspace = workspaceStorage.windows
				.find(({ id }) => id === workspaceStorage.focusedWindowId)!
				.workspaces.find(({ id }) => id === workspaceId)!;

			workspaceStorage.switchWorkspace(nextWorkspace);
			break;
		default:
			break;
	}
});
