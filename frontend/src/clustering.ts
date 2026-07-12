import { db, type Face, type Cluster } from './db';

export function getEuclideanDistance(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    const diff = v1[i] - v2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function getSquaredDistance(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    const diff = v1[i] - v2[i];
    sum += diff * diff;
  }
  return sum;
}

export function getClusterCenter(faces: Face[]): number[] {
  if (faces.length === 0) return [];
  const dim = faces[0].embedding.length;
  const sum = new Array(dim).fill(0);
  for (const f of faces) {
    for (let i = 0; i < dim; i++) {
      sum[i] += f.embedding[i];
    }
  }
  return sum.map(s => s / faces.length);
}

interface CachedFace {
  embedding: number[];
  clusterId: string;
}

export class IncrementalClusterer {
  private faces: CachedFace[] = [];
  private clusterCount = 0;
  private eventId: number;
  private matchThresholdSq: number;
  private avgThresholdSq: number;

  constructor(eventId: number, matchThreshold = 1.05, avgThreshold = 1.15) {
    this.eventId = eventId;
    this.matchThresholdSq = matchThreshold * matchThreshold;
    this.avgThresholdSq = avgThreshold * avgThreshold;
  }

  async init() {
    const existingFaces = await db.faces.where({ eventId: this.eventId }).toArray();
    const existingClusters = await db.clusters.where({ eventId: this.eventId }).toArray();
    this.clusterCount = existingClusters.length;

    for (const f of existingFaces) {
      if (f.clusterId) {
        this.faces.push({ embedding: f.embedding, clusterId: f.clusterId });
      }
    }
  }

  async assign(faceEmbedding: number[]): Promise<string> {
    if (this.faces.length === 0) {
      return this.createNewCluster(faceEmbedding);
    }

    let closestIdx = -1;
    let minDistSq = Infinity;

    for (let i = 0; i < this.faces.length; i++) {
      const distSq = getSquaredDistance(faceEmbedding, this.faces[i].embedding);
      if (distSq < minDistSq) {
        minDistSq = distSq;
        closestIdx = i;
      }
    }

    if (closestIdx >= 0 && minDistSq < this.matchThresholdSq) {
      const candidateClusterId = this.faces[closestIdx].clusterId;

      let totalDistSq = 0;
      let count = 0;
      for (const f of this.faces) {
        if (f.clusterId === candidateClusterId) {
          totalDistSq += getSquaredDistance(faceEmbedding, f.embedding);
          count++;
        }
      }
      const avgDistSq = totalDistSq / count;

      if (avgDistSq < this.avgThresholdSq) {
        this.faces.push({ embedding: faceEmbedding, clusterId: candidateClusterId });
        return candidateClusterId;
      }
    }

    return this.createNewCluster(faceEmbedding);
  }

  private async createNewCluster(embedding?: number[]): Promise<string> {
    this.clusterCount++;
    const newClusterId = `c_${this.eventId}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const newCluster: Cluster = {
      id: newClusterId,
      eventId: this.eventId,
      name: `דמות ${this.clusterCount}`,
    };
    await db.clusters.add(newCluster);

    if (embedding) {
      this.faces.push({ embedding, clusterId: newClusterId });
    }

    return newClusterId;
  }
}

export async function mergeClusters(targetClusterId: string, sourceClusterId: string): Promise<void> {
  if (targetClusterId === sourceClusterId) return;

  await db.transaction('rw', [db.faces, db.clusters], async () => {
    const sourceFaces = await db.faces.where({ clusterId: sourceClusterId }).toArray();
    for (const face of sourceFaces) {
      if (face.id) {
        await db.faces.update(face.id, { clusterId: targetClusterId });
      }
    }
    await db.clusters.delete(sourceClusterId);
  });
}

export async function renameCluster(eventId: number, clusterId: string, newName: string): Promise<void> {
  const trimmedName = newName.trim();
  if (!trimmedName) return;

  const existing = await db.clusters.where({ eventId, name: trimmedName }).first();
  if (existing) {
    if (existing.id !== clusterId) {
      await mergeClusters(existing.id, clusterId);
    }
  } else {
    await db.clusters.update(clusterId, { name: trimmedName });
  }
}
