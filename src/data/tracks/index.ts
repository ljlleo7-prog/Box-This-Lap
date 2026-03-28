import { Track } from '../../types';
import { SILVERSTONE } from './silverstone';
import { MONZA } from './monza';
import { SPA } from './spa';
import { CHINA } from './china';
import { SINGAPORE } from './singapore';
import { BAHRAIN } from './bahrain';
import { ABU_DHABI } from './abuDhabi';
import { MONACO } from './monaco';
import { MELBOURNE } from './melbourne';
import { MEXICO_CITY } from './mexicoCity';
import { SUZUKA } from './suzuka';
import { JEDDAH } from './jeddah';
import { MIAMI } from './miami';
import { IMOLA } from './imola';
import { CATALUNYA } from './catalunya';
import { MONTREAL } from './montreal';
import { SPIELBERG } from './spielberg';
import { HUNGARORING } from './hungaroring';
import { ZANDVOORT } from './zandvoort';
import { BAKU } from './baku';
import { AUSTIN } from './austin';
import { INTERLAGOS } from './interlagos';
import { LAS_VEGAS } from './lasVegas';
import { QATAR } from './qatar';

const TRACKS_BASE: Track[] = [
    SILVERSTONE,
    SUZUKA,
    MONZA,
    SPA,
    CHINA,
    JEDDAH,
    MIAMI,
    IMOLA,
    SINGAPORE,
    CATALUNYA,
    BAHRAIN,
    MONTREAL,
    SPIELBERG,
    HUNGARORING,
    ZANDVOORT,
    BAKU,
    AUSTIN,
    INTERLAGOS,
    LAS_VEGAS,
    QATAR,
    ABU_DHABI,
    MONACO,
    MELBOURNE,
    MEXICO_CITY
];

export const TRACKS: Track[] = TRACKS_BASE;

export { 
    SILVERSTONE, 
    MONZA, 
    SPA, 
    CHINA, 
    SUZUKA,
    JEDDAH,
    MIAMI,
    IMOLA,
    SINGAPORE, 
    CATALUNYA,
    BAHRAIN, 
    MONTREAL,
    SPIELBERG,
    HUNGARORING,
    ZANDVOORT,
    BAKU,
    AUSTIN,
    INTERLAGOS,
    LAS_VEGAS,
    QATAR,
    ABU_DHABI, 
    MONACO,
    MELBOURNE,
    MEXICO_CITY
};
