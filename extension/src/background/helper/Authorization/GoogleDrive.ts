/* exported getAccessToken */

import Browser from "webextension-polyfill";
import StorageProvider from "./StorageProvider";
import { BrowserStorage } from "@root/background/Entities";
import type {
	BackupProviderCredentials,
	BackupProviderStatusProps,
} from "@root/background/Entities/Singletons/BackupProviders";

const REDIRECT_URL = import.meta.env.PROD
	? "https://simpleworkspaces.com/auth/googledrive"
	: "http://localhost:3000/auth/googledrive";
const CLIENT_ID =
	"758528028452-hlu883tbm6bu8oolrso5sripso72a5ig.apps.googleusercontent.com";
// drive.appdata, drive.file, drive.metadata, drive.readonly
const SCOPES = [
	"https://www.googleapis.com/auth/drive.appdata",
	"https://www.googleapis.com/auth/drive.file",
];

const AUTH_URL_PARAMS = {
	client_id: CLIENT_ID,
	response_type: "code",
	redirect_uri: encodeURIComponent(REDIRECT_URL),
	scope: encodeURIComponent(SCOPES.join(" ")),
	prompt: "consent",
	access_type: "offline",
};

const AUTH_URL = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(
	AUTH_URL_PARAMS
)}`;

const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const FILES_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

export default class GoogleDrive extends StorageProvider {
	#accessToken?: string;
	#refreshToken?: string;
	#connected: boolean = false;
	#lastBackupTimeStamp: number = 0;

	constructor() {
		super();
	}

	async init() {
		const {
			GoogleDriveCredentials: { access_token = null, refresh_token = null },
		} = (await this.getLocalCredentials()) || {};
		if (access_token) this.#accessToken = access_token;
		if (refresh_token) this.#refreshToken = refresh_token;

		const {
			GoogleDriveStatus: { connected = false, lastTimeStamp = 0 },
		} = (await this.getLocalStatus()) || {};

		this.#connected = connected;
		this.#lastBackupTimeStamp = lastTimeStamp;
	}

	getLocalCredentials(): Promise<
		Record<"GoogleDriveCredentials", BackupProviderCredentials>
	> {
		return Browser.storage.local.get("GoogleDriveCredentials");
	}

	setLocalCredentials(credentials: BackupProviderCredentials): Promise<void> {
		return Browser.storage.local.set({ GoogleDriveCredentials: credentials });
	}

	getLocalStatus(): Promise<
		Record<"GoogleDriveStatus", BackupProviderStatusProps>
	> {
		return Browser.storage.local.get("GoogleDriveStatus");
	}

	setLocalStatus(status: BackupProviderStatusProps): Promise<void> {
		return Browser.storage.local.set({
			GoogleDriveStatus: status,
		});
	}

	get type() {
		return "Google Drive";
	}

	async openAuhPage() {
		console.info({ REDIRECT_URL, AUTH_URL });
		Browser.windows.create({
			url: AUTH_URL,
			type: "popup",
			allowScriptsToClose: true,
		});
	}

	getCredentials() {
		return {
			accessToken: this.#accessToken || null,
			refreshToken: this.#refreshToken! || null,
		};
	}

	async authorize(credentials: BackupProviderCredentials = {}) {
		const { access_token = undefined, refresh_token = undefined } = credentials;
		if (access_token) this.#accessToken = access_token;
		if (refresh_token) this.#refreshToken = refresh_token;

		await this.setLocalCredentials({
			access_token,
			refresh_token,
		});

		await this.setLocalStatus({ connected: true, lastTimeStamp: 0 });
	}

	get isAuthed(): boolean {
		return !!this.#accessToken;
	}

	async deauthorize() {
		this.#accessToken = undefined;
		this.#refreshToken = undefined;
		await this.setLocalStatus({ connected: false, lastTimeStamp: 0 });
		await this.setLocalCredentials({
			access_token: undefined,
			refresh_token: undefined,
		});
	}

	async getOrCreateAppFolder() {
		const params = {
			includeItemsFromAllDrives: "true",
			supportsAllDrives: "true",
		};

		const response = await fetch(
			`${FILES_URL}?${new URLSearchParams(params)}`,
			{
				headers: {
					Authorization: `Bearer ${this.#accessToken}`,
				},
			}
		);

		const data = await response.json();
		const fullFileList = data.files;

		let appFolder = fullFileList.find(
			(file) =>
				file.mimeType === "application/vnd.google-apps.folder" &&
				file.name === "simpleworkspaces"
		);

		if (appFolder) {
			return appFolder;
		} else {
			const response = await fetch(FILES_URL, {
				method: "POST",
				headers: { Authorization: `Bearer ${this.#accessToken}` },
				body: JSON.stringify({
					name: "simpleworkspaces",
					mimeType: "application/vnd.google-apps.folder",
				}),
			});
			const data = await response.json();
			return data;
		}
	}

	async filesList(): Promise<[]> {
		await this.getOrCreateAppFolder();

		const response = await fetch(FILES_URL, {
			headers: { Authorization: `Bearer ${this.#accessToken}` },
		});

		const data = await response.json();

		const filesFound = data.files.filter(
			(file) => file.mimeType !== "application/vnd.google-apps.folder"
		);

		return filesFound.map((file) => ({
			id: file.id,
			name: file.name.replace(/\.(.*?)$/g, ""),
		}));
	}

	async fileUpload(data: {
		id: string;
		name: string;
		contents: any;
	}): Promise<void> {
		let file = null;
		let appFolder = null;

		appFolder = await this.getOrCreateAppFolder();
		const filesList = await this.filesList();
		let existingFile = null;

		if (!data.id && !data.name) {
			throw new Error("Error, profile id and file name are required");
		} else {
			existingFile = filesList.find(
				(file) => file.id === data.id || `${file.name}.json` === data.name
			);
		}

		//TODO: encrypt Data

		const method = existingFile ? "PATCH" : "POST";
		const url = existingFile
			? `${FILES_UPLOAD_URL}/${existingFile.id}`
			: FILES_UPLOAD_URL;

		const params = { uploadType: "resumable" };

		const metadata = {
			name: existingFile ? existingFile.name : data.name,
			mimeType: "application/json",
			...(!existingFile && { parents: [appFolder.id] }),
		};

		file = new Blob([JSON.stringify(data.contents, null, 2)], {
			type: "application/json",
		});

		// initiate upload
		const response = await fetch(`${url}?${new URLSearchParams(params)}`, {
			method,
			headers: {
				Authorization: `Bearer ${this.#accessToken}`,
				"Content-Type": "application/json; charset=UTF-8",
				"X-Upload-Content-Length": `${file.size}`,
				"X-Upload-Content-Type": "application/json",
			},
			body: JSON.stringify(metadata),
		});

		await fetch(`${response.headers.get("location")}`, {
			method: "PUT",
			headers: {
				Authorization: `Bearer ${this.#accessToken}`,
				"Content-Length": `${file.size}`,
			},
			body: file,
		});
	}

	async fileDownload(data: {
		id: string;
		name: string;
		contents: any;
	}): Promise<{ contents: any }> {
		//TODO: check validation

		const files = await this.filesList();
		let existingFile = files.find((file) => file.id === data.id);

		const params = {
			alt: "media",
		};

		// initiate download
		const response = await fetch(
			`${FILES_URL}/${existingFile.id}?${new URLSearchParams(params)}`,
			{
				headers: { Authorization: `Bearer ${this.#accessToken}` },
			}
		);

		const _data = await response.blob();

		console.info("file downloaded", _data);

		//TODO: when encrypted, decrypt the data

		return { contents: JSON.parse(_data) };
	}
}