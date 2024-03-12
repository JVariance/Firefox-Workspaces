/* 
	Source: https://github.com/mdn/webextensions-examples/blob/main/google-userinfo/background/authorize.js
	License: MIT
	modified
*/

import type { BackupProviderCredentials } from "@root/background/Entities/Singletons/BackupProviders";

// import LZString from  "lz-string";
// gzip, zstd,, brotli
// import Cryptr from "cryptr";

// Secret string
// TODO: This pattern could be used to password-protect files as a new feature. For now it is just be using to compress and obfuscate the data.
// var secretKey = "GYYw7AHADAJsUFoBMFgEMEBYCMmCcCARgGwCsxCo2AzLDKdnmIUAAA==";

// var cryptr = new Cryptr(LZString.decompressFromBase64(secretKey));

/**
 * To help capture user-friendly error messaging
 */
export class StorageProviderError extends Error {
	constructor(message: string) {
		super(message);
	}
}

export default class StorageProvider {
	constructor() {}

	get type() {
		return "storageProvider";
	}
	getCredentials(): {
		accessToken: string | null;
		refreshToken: string | null;
	} {
		return { accessToken: null, refreshToken: null };
	}
	async openAuthPage() {}
	get isAuthed() {
		return true;
	}
	async authorize(credentials: BackupProviderCredentials) {}
	async deauthorize() {}
	async filesList(): Promise<[]> {
		return [];
	}
	async fileUpload(data: any) {}
	async fileDownload(data: any): Promise<any> {}
	encryptData(contents: any) {
		// return cryptr.encrypt(LZString.compressToBase64(JSON.stringify(contents)));
	}
	decryptData(contents: any) {
		// return JSON.parse(LZString.decompressFromBase64(cryptr.decrypt(contents)));
	}
}