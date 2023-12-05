namespace Ext {
	type Workspace = {
		id: string;
		icon: string;
		name: string;
		tabIds: number[];
		active: boolean;
		activeTabId?: number;
		windowId: number;
	};

	type Window = {
		id: number;
		workspaces: Workspace[];
	};
}
