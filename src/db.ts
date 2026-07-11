import Dexie, { type Table } from 'dexie';

export interface Event {
  id?: number;
  name: string;
  createdAt: number;
  folderPath?: string;
  directoryHandle?: FileSystemDirectoryHandle;
  declinedMerges?: string[]; // Array of "clusterIdA-clusterIdB" strings (sorted alphabetically)
}

export interface Photo {
  id?: number;
  eventId: number;
  fileName: string;
  fileHandle?: FileSystemFileHandle;
  fallbackBlob?: Blob; // Optimized compressed version (max 1200px) for non-supported directory browsers
  width: number;
  height: number;
  processed: boolean;
}

export interface Face {
  id?: number;
  eventId: number;
  photoId: number;
  clusterId?: string; // Links to Cluster.id
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  embedding: number[]; // 128-dimensional descriptor vector
  thumbnail: string; // Base64 data URL of the cropped face
}

export interface Cluster {
  id: string; // Format: c_{eventId}_{timestamp}_{random}
  eventId: number;
  name: string; // User-assigned name or default Hebrew placeholder
}

class EventTagDatabase extends Dexie {
  events!: Table<Event, number>;
  photos!: Table<Photo, number>;
  faces!: Table<Face, number>;
  clusters!: Table<Cluster, string>;

  constructor() {
    super('EventTagDatabase');
    this.version(1).stores({
      events: '++id, name, createdAt',
      photos: '++id, eventId, fileName, processed',
      faces: '++id, eventId, photoId, clusterId',
      clusters: 'id, eventId, name',
    });
  }
}

export const db = new EventTagDatabase();
