import { Processes, WorkspaceStorage } from "@root/background/Entities";
import { informViews } from "@root/background/informViews";
import * as API from "@root/browserAPI";
import type { Tabs } from "webextension-polyfill";

export async function tabsOnActivated(
	activeInfo: Tabs.OnActivatedActiveInfoType
) {
	/* 
		if user searched a tab via Firefox' search feature
	*/

	const previousTab = await API.getTab(activeInfo.previousTabId);
	const currentTab = await API.getTab(activeInfo.tabId);
	const previousTabWorkspaceUUID = await API.getTabValue<string>(
		previousTab?.id,
		"workspaceUUID"
	);

	const activeTabWorkspaceUUID = await API.getTabValue(
		activeInfo.tabId,
		"workspaceUUID"
	);
	const activeWindow = WorkspaceStorage.getWindow(activeInfo.windowId);

	const firefoxSearchWasUsed =
		// areNullish(activeTabWorkspaceUUID, previousTabWorkspaceUUID) &&
		activeTabWorkspaceUUID !== previousTabWorkspaceUUID &&
		activeTabWorkspaceUUID !== activeWindow.activeWorkspace.UUID &&
		previousTab?.windowId === currentTab?.windowId;

	console.info({ firefoxSearchWasUsed });

	if (firefoxSearchWasUsed) {
		Processes.searchWasUsed = true;
		const activeWorkspace = activeWindow.workspaces.find(
			({ UUID }) => UUID === activeTabWorkspaceUUID
		);

		if (activeWorkspace) {
			activeWindow.switchWorkspace(activeWorkspace).finally(() => {
				Processes.searchWasUsed = false;
			});
			informViews(activeWindow.windowId, "updatedActiveWorkspace", {
				UUID: activeWorkspace.UUID,
			});
		}
	}
}