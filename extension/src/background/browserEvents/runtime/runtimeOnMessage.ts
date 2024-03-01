import { WorkspaceStorage, Processes, BrowserStorage } from "../../Entities";
import { informViews } from "../../informViews";
import Browser from "webextension-polyfill";
import * as API from "@root/browserAPI";

function switchWorkspaceCommand({
	workspaceUUID,
	pageType,
}: {
	workspaceUUID: string;
	pageType: string;
}) {
	console.info("switchWorkspaceCommand", workspaceUUID);

	if (workspaceUUID === WorkspaceStorage.activeWindow.activeWorkspace.UUID)
		return;

	Processes.WorkspaceSwitch.start();
	const nextWorkspace = WorkspaceStorage.windows
		.get(WorkspaceStorage.focusedWindowId)!
		.workspaces.get(workspaceUUID)!;

	(async () => {
		await WorkspaceStorage.activeWindow.switchWorkspace(nextWorkspace);
		informViews(
			WorkspaceStorage.activeWindow.windowId,
			"updatedActiveWorkspace",
			{ UUID: nextWorkspace.UUID, sourcePage: pageType }
		);
	})();
	Processes.WorkspaceSwitch.finish();
	console.info("switchWorkspaceCommand Ende");
}

function switchWorkspaceAndFocusTab({
	workspaceUUID,
	tabId,
}: {
	workspaceUUID: string;
	tabId: number;
}) {
	const window = WorkspaceStorage.activeWindow;
	const workspace = window.workspaces.get(workspaceUUID);

	if (workspace) {
		workspace.activeTabId = tabId;
		window.switchWorkspace(workspace);
		informViews(window.windowId!, "updatedActiveWorkspace", {
			UUID: workspaceUUID,
		});
	}
}

export function runtimeOnMessage(message: any) {
	const { msg } = message;

	switch (msg) {
		case "clearDB":
			WorkspaceStorage.clearDB();
			break;
		case "logWindows":
			console.info(WorkspaceStorage.windows);
			break;
		case "awaitBackgroundInit":
			return new Promise<void>(async (resolve) => {
				await Processes.ExtensionInitialization;
				resolve();
			});
		case "addWorkspace":
			(async () => {
				informViews(WorkspaceStorage.activeWindow.windowId, "addedWorkspace", {
					workspace:
						await WorkspaceStorage.activeWindow.addWorkspaceAndSwitch(),
				});
			})();
			break;
		case "editWorkspace":
			console.info("editWorkspace", { message });
			WorkspaceStorage.getWindow(message.windowId).editWorkspace(message);
			informViews(message.windowId, "updatedWorkspaces");
			break;
		case "getWorkspaces":
			console.info("bg - getWorkspaces");
			return new Promise(async (resolve) => {
				await Promise.all([
					Processes.ExtensionInitialization,
					Processes.WindowCreation,
					Processes.TabCreation,
					Processes.TabDetachment,
					Processes.TabAttachment,
				]);

				const workspaces = WorkspaceStorage.getWindow(
					message.windowId
				).workspaces;

				const workspacesArray = Array.from(workspaces.values());

				console.info("background workspaces for window " + message.windowId, {
					workspacesArray,
				});

				return resolve(workspacesArray);
			});
		case "removeWorkspace":
			(async () => {
				const previousWorkspace = await WorkspaceStorage.getWindow(
					message.windowId
				).removeWorkspace(message.workspaceUUID);

				console.info("bg - removeWorkspace, previousWorkspace", {
					previousWorkspace,
				});

				if (previousWorkspace) {
					await informViews(
						WorkspaceStorage.activeWindow.windowId,
						"updatedWorkspaces"
					);
					informViews(
						WorkspaceStorage.activeWindow.windowId,
						"updatedActiveWorkspace",
						{ UUID: previousWorkspace.UUID }
					);
				}
			})();
			break;
		case "editedWorkspaces":
			(async () => {
				const { workspaces, windowId } = message as {
					workspaces: {
						workspaceUUID: string;
						name: string;
						icon: string;
					}[];
					windowId: number;
				};

				await Promise.all(
					workspaces?.map((workspace) =>
						WorkspaceStorage.getWindow(windowId).editWorkspace(workspace)
					) ?? []
				);

				informViews(windowId, "updatedWorkspaces");
			})();
			break;
		case "reorderedWorkspaces":
			(async () => {
				const { sortedWorkspacesIds, windowId } = message as {
					sortedWorkspacesIds: Ext.Workspace["UUID"][];
					windowId: number;
				};

				console.log({ sortedWorkspacesIds });

				await WorkspaceStorage.getWindow(windowId).reorderWorkspaces(
					sortedWorkspacesIds
				);

				informViews(windowId, "updatedWorkspaces");
			})();
			break;
		case "reloadAllTabs":
			(async () => {
				const tabIds = (
					await API.queryTabs({
						windowId: (await Browser.windows.getCurrent()).id,
					})
				).tabs?.map((tab) => tab.id!);

				tabIds?.forEach((tabId) => Browser.tabs.reload(tabId));
			})();
			break;
		case "showAllTabs":
			(async () => {
				const tabIds = (
					await API.queryTabs({
						windowId: (await Browser.windows.getCurrent()).id,
					})
				).tabs?.map((tab) => tab.id!);

				tabIds && Browser.tabs.show(tabIds);
			})();
			break;
		case "getCurrentTabIds":
			return new Promise(async (resolve) => {
				const tabIds =
					(
						await API.queryTabs({
							windowId: (await Browser.windows.getCurrent()).id,
						})
					).tabs?.map((tab) => tab.id!) || [];
				return resolve(tabIds);
			});
		case "switchWorkspace":
			switchWorkspaceCommand(message);
			break;
		case "switchWorkspaceAndFocusTab":
			switchWorkspaceAndFocusTab(message);
			break;
		case "setCurrentWorkspaces":
			return new Promise<void>(async (resolve) => {
				const { currentWorkspaces } = message as {
					currentWorkspaces: Ext.Workspace[];
				};

				await Promise.all(
					currentWorkspaces?.map(
						(workspace) =>
							WorkspaceStorage.activeWindow.editWorkspace({
								workspaceUUID: workspace.UUID,
								icon: workspace.icon,
								name: workspace.name,
							}) ?? []
					)
				);

				informViews(
					WorkspaceStorage.activeWindow.windowId,
					"updatedWorkspaces"
				);

				return resolve();
			});
		case "setHomeWorkspace":
			return new Promise<void>(async (resolve) => {
				console.info("setHomeWorkspace to " + message.homeWorkspace);
				WorkspaceStorage.windows.forEach((window) => {
					window.workspaces.get("HOME")!.name = message.homeWorkspace.name;
					window.workspaces.get("HOME")!.icon = message.homeWorkspace.icon;
				});
				await BrowserStorage.setHomeWorkspace(message.homeWorkspace);
				return resolve();
			});
		case "setDefaultWorkspaces":
			return new Promise<void>(async (resolve) => {
				await BrowserStorage.setDefaultWorkspaces(message.defaultWorkspaces);
				if (
					WorkspaceStorage.windows.size < 2 &&
					WorkspaceStorage.activeWindow.workspaces.size < 2
				) {
					await WorkspaceStorage.activeWindow.addDefaultWorkspaces();
					console.info("added default workspaces and now informviews");
					informViews(
						WorkspaceStorage.activeWindow.windowId,
						"updatedWorkspaces"
					);
				}

				return resolve();
			});
		case "getDefaultWorkspaces":
			return new Promise(async (resolve) => {
				const { defaultWorkspaces } =
					await BrowserStorage.getDefaultWorkspaces();
				return resolve(defaultWorkspaces);
			});
		case "getExistingWindowsWorkspaces":
			return new Promise(async (resolve) => {
				const existingWindowsWorkspaces = Array.from(
					WorkspaceStorage.windows.values()
				).map((window, i) => [
					i,
					Array.from(window.workspaces.values())
						.slice(1)
						.map(({ name, icon }) => ({ name, icon })),
				]);
				return resolve(existingWindowsWorkspaces);
			});
		case "forceApplyDefaultWorkspacesOnCurrentWindow":
			return new Promise<void>(async (resolve) => {
				await WorkspaceStorage.activeWindow.forceApplyDefaultWorkspaces();
				informViews(
					WorkspaceStorage.activeWindow.windowId,
					"updatedWorkspaces"
				);
				return resolve();
			});
		case "forceApplyDefaultWorkspacesOnAllWindows":
			return new Promise<void>(async (resolve) => {
				await WorkspaceStorage.forceApplyDefaultWorkspacesOnAllWindows();
				for (let windowId of WorkspaceStorage.windows.keys()) {
					console.info({ windowId });
					informViews(windowId, "updatedWorkspaces");
				}
				return resolve();
			});
		case "clearExtensionData":
			return new Promise<void>(async (resolve) => {
				await Browser.storage.local.clear();
				Browser.runtime.reload();
				return resolve();
			});
		case "getSystemTheme":
			return new Promise<"light" | "dark">(async (resolve) => {
				return resolve(
					window.matchMedia("(prefers-color-scheme: dark)").matches
						? "dark"
						: "light"
				);
			});
		case "getFullExportData":
			return new Promise(async (resolve) => {
				const fullExportData = new Map<
					Ext.Window["UUID"],
					Map<
						Ext.Workspace["UUID"],
						{
							icon: string;
							name: string;
							tabs: { url: string; active: boolean }[];
						}
					>
				>();

				for (let [windowId, window] of WorkspaceStorage.windows.entries()) {
					const windowTabs = (await API.queryTabs({ windowId }))?.tabs || [];

					fullExportData.set(window.UUID, new Map());

					for (let tab of windowTabs) {
						const workspaceUUID = await API.getTabValue<string>(
							tab.id,
							"workspaceUUID"
						);

						if (workspaceUUID) {
							if (!fullExportData.get(window.UUID)?.has(workspaceUUID)) {
								const workspace = window.workspaces.get(workspaceUUID)!;
								fullExportData.get(window.UUID)!.set(workspaceUUID, {
									icon: workspace.icon,
									name: workspace.name,
									tabs: [],
								});
							}

							fullExportData.get(window.UUID)?.get(workspaceUUID)?.tabs.push({
								url: tab.url!,
								active: tab.active,
							});
						}
					}
				}

				const fullExportDataArray = [];

				for (let [windowUUID, window] of fullExportData) {
					fullExportDataArray.push([windowUUID, Array.from(window)]);
				}

				return resolve(fullExportDataArray);
			});
		default:
			break;
	}
}
