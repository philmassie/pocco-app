package app.pocco.display;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OutputFolder")
public class OutputFolderPlugin extends Plugin {
    private static final String PREFS = "output_folder";
    private static final String URI_KEY = "tree_uri";

    @PluginMethod
    public void chooseFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        startActivityForResult(call, intent, "folderResult");
    }

    @ActivityCallback
    private void folderResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }

        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        if (uri == null) {
            call.reject("Folder picker returned no folder");
            return;
        }

        try {
            String name = folderName(uri);
            int flags = data.getFlags()
                & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            getContext().getContentResolver().takePersistableUriPermission(uri, flags);
            String previous = preferences().getString(URI_KEY, null);
            preferences().edit().putString(URI_KEY, uri.toString()).apply();
            if (previous != null && !previous.equals(uri.toString())) releasePermission(Uri.parse(previous));
            JSObject response = new JSObject();
            response.put("cancelled", false);
            response.put("selected", true);
            response.put("name", name);
            call.resolve(response);
        } catch (Exception e) {
            call.reject("Could not select the output folder", e);
        }
    }

    @PluginMethod
    public void getFolder(PluginCall call) {
        String value = preferences().getString(URI_KEY, null);
        try {
            JSObject response = new JSObject();
            response.put("selected", value != null);
            response.put("name", value == null ? "Documents" : folderName(Uri.parse(value)));
            call.resolve(response);
        } catch (Exception e) {
            call.reject("Could not access the selected output folder", e);
        }
    }

    @PluginMethod
    public void clearFolder(PluginCall call) {
        String value = preferences().getString(URI_KEY, null);
        preferences().edit().remove(URI_KEY).apply();
        if (value != null) releasePermission(Uri.parse(value));
        call.resolve();
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        String name = call.getString("name");
        String content = call.getString("data");
        if (name == null || name.isEmpty() || content == null) {
            call.reject("A file name and CSV data are required");
            return;
        }

        String value = preferences().getString(URI_KEY, null);
        if (value == null) {
            call.reject("No output folder has been selected");
            return;
        }

        try {
            Uri treeUri = Uri.parse(value);
            Uri parentUri = DocumentsContract.buildDocumentUriUsingTree(
                treeUri,
                DocumentsContract.getTreeDocumentId(treeUri)
            );
            Uri fileUri = findChild(treeUri, name);
            if (fileUri == null) {
                fileUri = DocumentsContract.createDocument(
                    getContext().getContentResolver(),
                    parentUri,
                    "text/csv",
                    name
                );
            }
            if (fileUri == null) throw new IllegalStateException("Folder provider could not create the CSV file");

            try (OutputStream stream = getContext().getContentResolver().openOutputStream(fileUri, "wt")) {
                if (stream == null) throw new IllegalStateException("Folder provider did not open the CSV file");
                stream.write(content.getBytes(StandardCharsets.UTF_8));
            }

            JSObject response = new JSObject();
            response.put("name", name);
            call.resolve(response);
        } catch (Exception e) {
            call.reject("Could not write CSV to the selected folder", e);
        }
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS, 0);
    }

    private void releasePermission(Uri uri) {
        try {
            getContext().getContentResolver().releasePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException ignored) {
            // The grant may already have been revoked by Android.
        }
        try {
            getContext().getContentResolver().releasePersistableUriPermission(uri, Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (SecurityException ignored) {
            // The grant may already have been revoked by Android.
        }
    }

    private String folderName(Uri treeUri) throws Exception {
        Uri documentUri = DocumentsContract.buildDocumentUriUsingTree(
            treeUri,
            DocumentsContract.getTreeDocumentId(treeUri)
        );
        try (Cursor cursor = getContext().getContentResolver().query(
            documentUri,
            new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME },
            null,
            null,
            null
        )) {
            if (cursor == null) throw new IllegalStateException("Folder provider did not return folder details");
            if (cursor.moveToFirst()) return cursor.getString(0);
        }
        throw new IllegalStateException("Folder provider returned no folder name");
    }

    private Uri findChild(Uri treeUri, String name) {
        String parentId = DocumentsContract.getTreeDocumentId(treeUri);
        Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentId);
        try (Cursor cursor = getContext().getContentResolver().query(
            childrenUri,
            new String[] {
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME
            },
            null,
            null,
            null
        )) {
            if (cursor == null) throw new IllegalStateException("Folder provider did not list the selected folder");
            int idColumn = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID);
            int nameColumn = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME);
            while (cursor.moveToNext()) {
                if (name.equals(cursor.getString(nameColumn))) {
                    return DocumentsContract.buildDocumentUriUsingTree(treeUri, cursor.getString(idColumn));
                }
            }
        }
        return null;
    }
}
