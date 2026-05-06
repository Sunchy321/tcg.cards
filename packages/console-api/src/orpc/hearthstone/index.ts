import { announcementTrpc } from './announcement';
import { hsdataFull, hsdataLight } from './data-source/hsdata';
import { setTrpc } from './set';
import { tagTrpc } from './tag';
import { imageTrpc } from './image';

export const hearthstoneLight = {
	announcement: announcementTrpc,
	set:          setTrpc,
	tag:          tagTrpc,
	dataSource:   { hsdata: hsdataLight },
};

export const hearthstoneMedium = {
	announcement: announcementTrpc,
	set:          setTrpc,
	tag:          tagTrpc,
	image:        imageTrpc,
};

export const hearthstoneFull = {
	announcement: announcementTrpc,
	set:          setTrpc,
	tag:          tagTrpc,
	image:        imageTrpc,
	dataSource:   { hsdata: hsdataFull },
};

