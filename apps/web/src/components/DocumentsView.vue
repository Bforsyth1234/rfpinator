<template>
  <div class="mx-auto max-w-2xl space-y-8">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Documents</h1>
      <p class="mt-1 text-sm text-gray-500">
        Manage the policy documents ingested into the vector store.
      </p>
    </div>

    <!-- Upload section -->
    <div class="card">
      <h2 class="text-lg font-semibold text-gray-800">Upload Documents</h2>
      <p class="mt-1 text-sm text-gray-500">
        Upload PDF or Markdown policy documents to add to the knowledge base.
      </p>
      <div class="mt-4">
        <input
          ref="fileRef"
          type="file"
          multiple
          accept=".pdf,.md,.txt"
          class="hidden"
          @change="handleFileSelect"
        />
        <button type="button" class="btn-secondary" @click="fileRef?.click()">
          Select Files
        </button>
        <ul v-if="pendingFiles.length > 0" class="mt-3 space-y-1 text-sm text-gray-600">
          <li v-for="f in pendingFiles" :key="f.name">📄 {{ f.name }}</li>
        </ul>
      </div>

      <div v-if="pendingFiles.length > 0" class="mt-4 flex items-center gap-4">
        <button
          type="button"
          :disabled="uploading"
          class="btn-primary"
          @click="handleUpload"
        >
          {{ uploading ? "Uploading…" : "Upload" }}
        </button>
      </div>

      <p
        v-if="uploadError"
        class="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
      >
        {{ uploadError }}
      </p>
      <p
        v-if="uploadSuccess"
        class="mt-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700"
      >
        Documents uploaded successfully.
      </p>
    </div>

    <!-- Ingested documents list -->
    <div class="card">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-800">
          Ingested Documents
          <span v-if="!loadingDocs" class="ml-1 text-sm font-normal text-gray-400">
            ({{ documents.length }})
          </span>
        </h2>
        <button
          type="button"
          class="btn-secondary text-xs"
          :disabled="loadingDocs"
          @click="loadDocuments"
        >
          {{ loadingDocs ? "Loading…" : "Refresh" }}
        </button>
      </div>

      <p v-if="docsError" class="mt-2 text-sm text-red-600">{{ docsError }}</p>

      <div v-if="loadingDocs" class="mt-4 flex items-center gap-2 text-sm text-gray-500">
        <div
          class="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand-primary"
        />
        Loading documents…
      </div>

      <div v-else-if="documents.length === 0" class="mt-4 text-sm text-gray-400 italic">
        No documents ingested yet.
      </div>

      <ul v-else class="mt-4 divide-y divide-surface-border">
        <li
          v-for="doc in documents"
          :key="doc.id"
          class="flex items-center justify-between py-3"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-gray-800">{{ doc.filename }}</p>
            <p class="text-xs text-gray-400">
              {{ doc.chunkCount }} chunk{{ doc.chunkCount !== 1 ? "s" : "" }}
            </p>
          </div>
          <button
            type="button"
            class="ml-4 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
            :disabled="deletingId === doc.id"
            @click="handleDelete(doc.id)"
          >
            {{ deletingId === doc.id ? "Deleting…" : "Delete" }}
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import type { DocumentInfo } from "@rfpinator/shared";
import { uploadFiles, fetchDocuments, deleteDocument } from "@/lib/api-client";

const pendingFiles = ref<File[]>([]);
const uploading = ref(false);
const uploadError = ref<string | null>(null);
const uploadSuccess = ref(false);
const fileRef = ref<HTMLInputElement | null>(null);

const documents = ref<DocumentInfo[]>([]);
const loadingDocs = ref(false);
const docsError = ref<string | null>(null);
const deletingId = ref<string | null>(null);

onMounted(() => {
  loadDocuments();
});

function handleFileSelect(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (files) pendingFiles.value = Array.from(files);
}

async function handleUpload() {
  if (pendingFiles.value.length === 0) return;
  uploading.value = true;
  uploadError.value = null;
  uploadSuccess.value = false;
  try {
    await uploadFiles(pendingFiles.value);
    uploadSuccess.value = true;
    pendingFiles.value = [];
    // Refresh the document list after upload
    await loadDocuments();
  } catch (err: unknown) {
    uploadError.value = err instanceof Error ? err.message : "Upload failed.";
  } finally {
    uploading.value = false;
  }
}

async function loadDocuments() {
  loadingDocs.value = true;
  docsError.value = null;
  try {
    documents.value = await fetchDocuments();
  } catch (err: unknown) {
    docsError.value =
      err instanceof Error ? err.message : "Failed to load documents.";
  } finally {
    loadingDocs.value = false;
  }
}

async function handleDelete(id: string) {
  if (!confirm("Delete this document from the vector store?")) return;
  deletingId.value = id;
  try {
    await deleteDocument(id);
    documents.value = documents.value.filter((d) => d.id !== id);
  } catch (err: unknown) {
    docsError.value =
      err instanceof Error ? err.message : "Failed to delete document.";
  } finally {
    deletingId.value = null;
  }
}
</script>
