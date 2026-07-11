import { db, type Face, type Cluster } from './db';

// Euclidean distance between two vectors
export function getEuclideanDistance(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    const diff = v1[i] - v2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Calculate the average embedding vector (centroid) of a group of faces
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

// Incremental Clustering with drift protection: 
// 1. Finds the closest individual face in the database (strict threshold: 0.48).
// 2. Verifies the average distance to that face's cluster is also within a safe limit (0.52) to prevent chaining.
// 3. Otherwise, creates a new cluster.
export async function assignFaceToCluster(
  eventId: number,
  faceEmbedding: number[],
  matchThreshold = 0.50,
  avgThreshold = 0.54
): Promise<string> {
  const eventClusters = await db.clusters.where({ eventId }).toArray();
  const eventFaces = await db.faces.where({ eventId }).toArray();
  
  if (eventClusters.length === 0 || eventFaces.length === 0) {
    return createNewCluster(eventId, eventClusters.length + 1);
  }

  // 1. Find the single closest face in the event database
  let closestFace: Face | null = null;
  let minDistance = Infinity;

  for (const f of eventFaces) {
    if (!f.clusterId) continue;
    const dist = getEuclideanDistance(faceEmbedding, f.embedding);
    if (dist < minDistance) {
      minDistance = dist;
      closestFace = f;
    }
  }

  // 2. If the closest face matches within a strict threshold
  if (closestFace && minDistance < matchThreshold) {
    const candidateClusterId = closestFace.clusterId!;
    
    // 3. Prevent drift by checking average distance to all faces in this cluster
    const clusterFaces = eventFaces.filter(f => f.clusterId === candidateClusterId);
    let totalDist = 0;
    for (const cf of clusterFaces) {
      totalDist += getEuclideanDistance(faceEmbedding, cf.embedding);
    }
    const avgDist = totalDist / clusterFaces.length;

    // Only assign if it matches the general cluster profile
    if (avgDist < avgThreshold) {
      return candidateClusterId;
    }
  }

  // 4. Otherwise, create a new cluster profile
  return createNewCluster(eventId, eventClusters.length + 1);
}

async function createNewCluster(eventId: number, count: number): Promise<string> {
  const newClusterId = `c_${eventId}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  const newCluster: Cluster = {
    id: newClusterId,
    eventId,
    name: `דמות ${count}`,
  };
  await db.clusters.add(newCluster);
  return newClusterId;
}

// Merges a source cluster into a target cluster
export async function mergeClusters(targetClusterId: string, sourceClusterId: string): Promise<void> {
  if (targetClusterId === sourceClusterId) return;

  await db.transaction('rw', [db.faces, db.clusters], async () => {
    // 1. Point all faces in source cluster to target cluster
    const sourceFaces = await db.faces.where({ clusterId: sourceClusterId }).toArray();
    for (const face of sourceFaces) {
      if (face.id) {
        await db.faces.update(face.id, { clusterId: targetClusterId });
      }
    }
    // 2. Delete source cluster
    await db.clusters.delete(sourceClusterId);
  });
}

// Renames a cluster, merging with an existing one if names conflict
export async function renameCluster(eventId: number, clusterId: string, newName: string): Promise<void> {
  const trimmedName = newName.trim();
  if (!trimmedName) return;

  // Search if a cluster with the exact name already exists in this event
  const existing = await db.clusters.where({ eventId, name: trimmedName }).first();
  if (existing) {
    if (existing.id !== clusterId) {
      // Merge current cluster into existing one
      await mergeClusters(existing.id, clusterId);
    }
  } else {
    // Simply rename
    await db.clusters.update(clusterId, { name: trimmedName });
  }
}
