#RBX

An opinionated implementation of the Rollbase AJAX Queries API that uses promises. It adds some additional functionality to make querying and working with results a lot easier (IMHO).

Disclaimers:
* first draft
* not tested much
* yolo :)

Issues and Pull Requests are totally welcome!

## Examples

### Create a new record and log the new id

```JavaScript
rbx.createRecord('Patient', { First_Name: 'Jane', Last_Name: 'Smith' })
.then((id) => console.log(id));
```

### Retrieve some records and log a field from each one

```JavaScript
rbx.selectQuery('SELECT id, name FROM Patient', 0, 200)
.then((records) => records.forEach((record) => console.log(record.getField('name'))));
```

### Retrieve some records (along with related records) and log them as JSON

```JavaScript
// returns a list of 'Patient' records along with related 'Exam' records
async function getPatients () {
    var records = await rbx.selectQuery('SELECT id, name FROM Patient', 0, 200);
    return Promise.all(records.map(
        (record) => record.getRelatedRecords('R349202940', 'SELECT id, name FROM Exam', 0, 200)
    ));
}

// get a list of patients (along with related exams) and log it to the console
getPatients()
.then((records) => records.forEach((record) => console.log(record.getAsObject())))
.catch((err) => console.log(err.message));
```

### Session data

```JavaScript
rbx.getSessionData('some_key')
.then((value) => console.log(value))
.catch((err) => console.log(err.message));
```

### Uploading files

```HTML
<input name="files" id="files" type="file" aria-label="files" />
<p style="padding-top: 1em; text-align: right">
	<button id="primaryTextButton" class="k-primary">Go!</button>
</p>

<script>
var kendoUpload = $("#files").kendoUpload().data('kendoUpload');

function onClick(e) {
	var files = kendoUpload.getFiles();

  	// 'SELECT' *must* include all fields.
  	rbx.selectQuery('SELECT id, name, Sample_Image, Sample_Price FROM Sample_Object WHERE id = 24018')
    .then(function (records) {
      	var record = records[0];
      
      	record.setField('name', kendo.guid());
      	record.setField('Sample_Image', files[0].rawFile);

      	// Be careful...'update()' will reset all fields that it doesn't recieve the value of
      	// that's why the 'SELECT' above should include all fields you don't want to be reset.
		// It's possible to remove this requirement by further parsing what's returned when the [internal] pageData call is made.
      	return record.update(15030);
    })
    .then(() => console.log('done!'));
}

$("#primaryTextButton").kendoButton({
	click: onClick
});
</script>
```