// Firestore's current user document may contain additional application fields.
// Compare the fields this app actually edits, plus its change marker.
function normalizedState(data) {
  return {
    tasks: data?.tasks ?? [],
    worklist: data?.worklist ?? [],
    notes: data?.notes ?? "",
    updatedAt: data?.updatedAt ?? null,
  };
}

function stateSignature(data) {
  // Firestore map field order is not an application data change.
  // Sort object keys recursively, but preserve array order and JSON values.
  return JSON.stringify(normalizedState(data), (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.keys(value).sort().map((key) => [key, value[key]])
      );
    }
    return value;
  });
}

function validUserDocument(data) {
  return Boolean(data && typeof data === "object"
    && (data.tasks === undefined || Array.isArray(data.tasks))
    && (data.worklist === undefined || Array.isArray(data.worklist))
    && (data.notes === undefined || typeof data.notes === "string"));
}

export { normalizedState, stateSignature, validUserDocument };
