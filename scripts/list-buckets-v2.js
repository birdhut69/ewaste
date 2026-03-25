
import { Client, Storage } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://cloud.appwrite.io/v1')
    .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const storage = new Storage(client);

async function listBuckets() {
    try {
        const result = await storage.listBuckets();
        console.log("Buckets:", JSON.stringify(result.buckets, null, 2));
    } catch (e) {
        console.error("Error listing buckets:", e);
    }
}

listBuckets();
