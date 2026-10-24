import { dataSourceTrpc } from './data-source';
import { list, listFiles, get, getNodes } from './rule-light';
import { changes, change, review, reviewBatch, nodeHistory, compareVersions, nodeContent } from './rule-medium';
import { deleteVersion, syncLatest, loadFromData, uploadToR2, uploadArchive, rematch } from './rule-heavy';

export const magicLight = {
  dataSource: dataSourceTrpc,
  rule:       { list, listFiles, get, getNodes },
};

export const magicMedium = {
  dataSource: dataSourceTrpc,
  rule:       {
    list,
    listFiles,
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
  dataSource: dataSourceTrpc,
  rule:       {
    list,
    listFiles,
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
    delete: deleteVersion,
    rematch,
  },
};
