import { announcementTrpc } from './announcement';
import { setTrpc } from './set';
import { tagTrpc } from './tag';
import { imageTrpc } from './image';
import { hsdataLight, hsdataFull } from './data-source/hsdata';

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
	dataSource:   { hsdata: hsdataLight },
};

export const hearthstoneFull = {
	announcement: announcementTrpc,
	set:          setTrpc,
	tag:          tagTrpc,
	image:        imageTrpc,
	dataSource:   { hsdata: hsdataFull },
};

