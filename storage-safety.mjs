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
  return JSON.stringify(normalizedState(data));
}

function validUserDocument(data) {
  return Boolean(data && typeof data === "object"
    && (data.tasks === undefined || Array.isArray(data.tasks))
    && (data.worklist === undefined || Array.isArray(data.worklist))
    && (data.notes === undefined || typeof data.notes === "string"));
}

export { normalizedState, stateSignature, validUserDocument };
