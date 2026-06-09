import { announcementTrpc } from './announcement';
import { dataSourceTrpc } from './data-source';
import { list, get, getNodes } from './rule-light';
import { changes, change, review, reviewBatch, nodeHistory, compareVersions, nodeContent } from './rule-medium';
import { deleteVersion, syncLatest, loadFromData, uploadToR2, uploadArchive, rematch } from './rule-heavy';

export const magicLight = {
	announcement: announcementTrpc,
	dataSource:   dataSourceTrpc,
	rule:         { list, get, getNodes },
};

export const magicMedium = {
	announcement: announcementTrpc,
	dataSource:   dataSourceTrpc,
	rule:         {
		list,
		get,
		getNodes,
		changes,
		change,
		review,
		reviewBatch,
		nodeHistory,
		compareVersions,
		nodeContent,
	},
};

export const magicFull = {
	announcement: announcementTrpc,
	dataSource:   dataSourceTrpc,
	rule:         {
		list,
		get,
		getNodes,
		changes,
		change,
		review,
		reviewBatch,
		nodeHistory,
		compareVersions,
		nodeContent,
		loadFromData,
		uploadToR2,
		uploadArchive,
		syncLatest,
		delete:  deleteVersion,
		rematch,
	},
};

