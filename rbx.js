window.rbx = (function (rbx) {
    'use strict';

    function Record (id, objName, values, columns) {
        this.id = id;
        this.objName = objName;
        this.values = values;
        this.columns = columns;

        this.relationships = [];

        this.hasField = function (fieldName) {
            var index = this.columns.indexOf(fieldName);
            return (index !== -1);
        };

        this.setField = function (fieldName, value) {
            if (this.hasField(fieldName)) {
                this.values[this.columns.indexOf(fieldName)] = value;
                return true;
            }
            throw new Error('Record does not contain \'' + fieldName + '\'');
        };

        this.getField = function (fieldName) {
            if (this.hasField(fieldName)) {
                return this.values[this.columns.indexOf(fieldName)];
            }
            throw new Error('Record does not contain \'' + fieldName + '\'');
        };

        this.getRelatedRecords = function (relName, query, rowFrom, maxRows) {
            var self = this;

            return new Promise(function(resolve, reject) {
                rbx.getRelatedIds(relName, self.objName, self.id)
                .then(function (result) {
                    if (result.values.length) {
                        var q = parseQuery(query);

                        if (q.hasWhere) {
                            query = query.replace(/ WHERE /i, ' WHERE id IN (' + result.values.join(',') + ') AND ');
                        } else {
                            query += ' WHERE id IN (' + result.values.join(',') + ')';
                        }

                        rbx.selectQuery(query, rowFrom, maxRows)
                        .then(function (records) {
                            self.relationships.push({ relName: relName, records: records });
                            resolve(self);
                        });
                    } else {
                        resolve(self);
                    }
                });
            });
        };

        this.getAsObject = function () {
            var obj = {};

            for (var a = 0, b = this.columns.length; a < b; a++) {
                obj[this.columns[a]] = this.values[a];
            }

            for (var a = 0, b = this.relationships.length; a < b; a++) {
                obj[this.relationships[a].relName] = [];

                for (var c = 0, d = this.relationships[a].records.length; c < d; c++) {
                    obj[this.relationships[a].relName].push(this.relationships[a].records[c].getAsObject());
                }
            }

            return obj;
        };

        this.update = function (pageId) {
            var self = this;

            return new Promise(function(resolve, reject) {
                var data = {
                    cmd: 'pageData',
                    pageId: pageId,
                    appId: rb.newui.webPageData.appDetails.appId
                };
              
                $.ajax({
                    type: 'GET',
                    url: rbf_getAjaxURL(),
                    data: data,
                    success: function(d)
                    {
                        var objDefId = d.result.webPageDataSubset.pageObjectRecord.objDefId;

                        var url = d.result.webPageDataSubset.pageData.form.action;

                        var hiddenFields = d.result.webPageDataSubset.pageData.form.hidden;

                        var formId = hiddenFields.filter(function(f) {
                            return f.name == 'formId';
                        })[0].value;

                        var csrf = hiddenFields.filter(function(f) {
                            return f.name == '_csrf';
                        })[0].value;

                        var sessionId = hiddenFields.filter(function(f) {
                            return f.name == 'sessionId';
                        })[0].value;

                        var formData = new FormData();

                        formData.append('act', 'objUpdate');
                        formData.append('sessionId', sessionId);
                        formData.append('formId', formId);
                        formData.append('_csrf', csrf);
                        formData.append('srcId', pageId);
                        formData.append('objDefId', objDefId);

                        for (var a = 0, b = self.columns.length; a < b; a++) {
                            formData.append(self.columns[a], self.values[a]);
                        }

                        $.ajax({
                            type: 'POST',
                            url: url,
                            data: formData,
                            processData: false,
                            contentType: false,
                            success: function(response) {
                                var webPageData = getWebPageData(response);

                                if (webPageData.pageId === pageId) {
                                    var sections = webPageData.pageData.sections.filter(function(f) {
                                        return (((f.hasOwnProperty('formBegin') && !f.formBegin) && (f.hasOwnProperty('formEnd') && !f.formBegin)) || (!f.hasOwnProperty('formBegin') && !f.hasOwnProperty('formEnd')));
                                    });

                                    var errors = [];

                                    for (var a = 0, b = sections.length; a < b; a++) {
                                        var cells = sections[a].allCellsData;

                                        for (var c = 0, d = cells.length; c < d; c++) {
                                            if (cells[c][0].serverValidation.errorMsg !== '') {
                                              errors.push({ fieldName: cells[c][0].fieldName, errorMsg: cells[c][0].serverValidation.errorMsg });
                                            }
                                        }
                                    }

                                    reject(errors);
                                }

                                resolve();
                            }
                        });
                    }
                });
            });
        };

        var getWebPageData = function (response) {
            var htmlDoc = document.implementation.createHTMLDocument();
            htmlDoc.body.innerHTML = response;
            
            var scripts = [].map.call(htmlDoc.getElementsByTagName('script'), function(el) {
                return el.textContent;
            });

            for (var a = 0, b = scripts.length; a < b; a++) {
                var matches = /rb.newui.webPageData = (\{.+?\});?\n/i.exec(scripts[a]);

                if (matches) {
                    return JSON.parse(matches[1]);
                }
            }
        };
    }

    // ========= UTILS =========
    var parseQuery = function (query) {
        var match = /SELECT ((?:[\w\#]+(?:,? +))+)FROM (\w+)/i.exec(query);
        var columns = match[1].split(',').map(function(item) {
          return item.trim().replace('#', '_');
        });
        var objName = match[2];
        var hasWhere = / WHERE /i.test(query);

        var result = {
            objName: objName,
            columns: columns,
            hasWhere: hasWhere
        }

        return result;
    };

    var rbx = {
        createRecord: function (objName, fieldMap, useIds, useLegacyDateFormat) {
            return new Promise(function(resolve, reject) {
                var data = {
                    cmd: 'apiCreate',
                    useIds: useIds,
                    objName: objName,
                    useLegacyDateFormat: useLegacyDateFormat || ''
                };

                for (var fieldName in fieldMap) {
                    var fieldValue = fieldMap[fieldName];

                    if (typeof fieldValue === 'object') {
                        fieldValue = JSON.stringify(fieldValue);
                    }

                    data[fieldName] = fieldValue;
                }

                $.ajax({
                    url: rbf_getAjaxURL(),
                    data: data,
                    type: 'POST',
                    contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
                    traditional: true,
                    success: function(response) {
                        var $err = $(response).find('Error');
                        if ($err.length) {
                            reject(Error($err.text()));
                        } else {
                            resolve(response);
                        }
                    }
                });
            });
        },

        deleteRecord: function (objName, id) {
            return new Promise(function(resolve, reject) {
                var data = {
                    cmd: 'apiDelete',
                    objName: objName,
                    id: id,
                    useLegacyDateFormat: useLegacyDateFormat || ''
                };

                $.ajax({
                    url: rbf_getAjaxURL(),
                    data: data,
                    type: 'GET',
                    traditional: true,
                    success: function(response) {
                        var $err = $(response).find('Error');
                        if ($err.length) {
                            reject(Error($err.text()));
                        } else {
                            resolve(response);
                        }
                    }
                });
            });
        },

        getFields: function (objName, id, fields, useLegacyDateFormat, options) {
            return new Promise(function(resolve, reject) {
                var data = {
                    cmd: 'apiGetFields',
                    output: 'json',
                    objName: objName,
                    id: id,
                    fields: fields,
                    useLegacyDateFormat: useLegacyDateFormat || ''
                };

                if (options) {
                    data.options = JSON.stringify(options);
                }

                $.ajax({
                    url: rbf_getAjaxURL(),
                    data: data,
                    type: 'GET',
                    traditional: true,
                    success: function(response) {
                        var $err = $(response).find('Error');
                        if ($err.length) {
                            reject(Error($err.text()));
                        } else {
                            resolve({ objName: objName, id: id, values: response });
                        }
                    }
                });
            });
        },

        getRelatedFields: function (relName, objName, id, fieldName, useLegacyDateFormat, options) {
            return new Promise(function(resolve, reject) {
                var data = {
                    cmd: 'apiGetRelFields',
                    output: 'json',
                    relName: relName,
                    objName: objName,
                    id: id,
                    fieldName: fieldName,
                    useLegacyDateFormat: useLegacyDateFormat || ''
                };

                if (options) {
                    data.options = JSON.stringify(options);
                }

                $.ajax({
                    url: rbf_getAjaxURL(),
                    data: data,
                    type: 'GET',
                    traditional: true,
                    success: function(response) {
                        var $err = $(response).find('Error');
                        if ($err.length) {
                            reject(Error($err.text()));
                        } else {
                            resolve({ relName: relName, id: id, values: response });
                        }
                    }
                });
            });
        },

        getRelatedIds: function (relName, objName, id, useLegacyDateFormat) {
            return new Promise(function(resolve, reject) {
                var data = {
                    cmd: 'apiGetRelIds',
                    output: 'json',
                    relName: relName,
                    objName: objName,
                    id: id,
                    useLegacyDateFormat: useLegacyDateFormat || ''
                };

                $.ajax({
                    url: rbf_getAjaxURL(),
                    data: data,
                    type: 'GET',
                    traditional: true,
                    success: function(response) {
                        var $err = $(response).find('Error');
                        if ($err.length) {
                            reject(Error($err.text()));
                        } else {
                            resolve({ relName: relName, id: id, values: response });
                        }
                    }
                });
            });
        },

        selectQuery: async function (query, rowFrom, maxRows, useLegacyDateFormat, options) {
            return new Promise(function(resolve, reject) {
                var data = {
                    cmd: 'apiSelectQuery',
                    output: 'json',
                    rowFrom: rowFrom,
                    maxRows: maxRows,
                    query: query,
                    useLegacyDateFormat: useLegacyDateFormat || ''
                };

                if (options) {
                    data.options = JSON.stringify(options);
                }

                $.ajax({
                    url: rbf_getAjaxURL(),
                    data: data,
                    type: 'GET',
                    traditional: true,
                    success: function(response) {
                        var $err = $(response).find('Error');
                        if ($err.length) {
                            reject(Error($err.text()));
                        } else {
                            var q = parseQuery(query);

                            if (q.columns.indexOf('id') === -1) {
                                reject(Error('Query must include \'id\' field'));
                            }

                            var records = response.map(function (r) {
                                return new Record(r[0], q.objName, r, q.columns);
                            });

                            resolve(records);
                        }
                    }
                });
            });
        },

        selectValue: function (query, useLegacyDateFormat, options) {
            return new Promise(function(resolve, reject) {
                var data = {
                    cmd: 'apiSelectValue',
                    query: query,
                    useLegacyDateFormat: useLegacyDateFormat || ''
                };

                if (objName !== null) {
                    data.objName = objName;
                }

                $.ajax({
                    url: rbf_getAjaxURL(),
                    data: data,
                    type: 'GET',
                    traditional: true,
                    success: function(response) {
                        var $err = $(response).find('Error');
                        if ($err.length) {
                            reject(Error($err.text()));
                        } else {
                            resolve(response);
                        }
                    }
                });
            });
        },

        setField: function (objName, id, fieldName, fieldValue, useIds, useLegacyDateFormat) {
            return new Promise(function(resolve, reject) {
                var data = {
                    cmd: 'apiSetField',
                    useIds: useIds,
                    objName: objName,
                    field: fieldName,
                    useLegacyDateFormat: useLegacyDateFormat || ''
                };

                if (typeof fieldValue === 'object') {
                    fieldValue = JSON.stringify(fieldValue);
                }

                data.value = fieldValue;

                $.ajax({
                    url: rbf_getAjaxURL(),
                    data: data,
                    type: 'POST',
                    traditional: true,
                    success: function(response) {
                        var $err = $(response).find('Error');
                        if ($err.length) {
                            reject(Error($err.text()));
                        } else {
                            resolve();
                        }
                    }
                });
            });
        },

        setSessionData: function (key, value) {
            return new Promise(function(resolve, reject) {
                $.ajax({
                    url: rbf_getAjaxURL(),
                    data: {
                        cmd: 'setUserSessionData',
                        userJsonKey: key == null ? key : key.toString(),
                        userJsonValue: JSON.stringify(value)
                    },
                    type: 'POST',
                    dataType: 'text',
                    traditional: true,
                    success: function(response) {
                        resolve(response);
                    },
                    error: function(xhr, status, error) {
                        reject(Error($(xhr.responseText).find('err').first().text()));
                    }
                });
            });
        },

        getSessionData: function (key) {
            return new Promise(function(resolve, reject) {
                $.ajax({
                    url: rbf_getAjaxURL(),
                    data: {
                        cmd: 'getUserSessionData',
                        userJsonKeys: key == null ? key : key.toString()
                    },
                    type: 'POST',
                    dataType: 'json',
                    traditional: true,
                    success: function(response, key) {
                        resolve(response);
                    },
                    error: function(xhr, status, error) {
                        reject(Error($(xhr.responseText).find('err').first().text()));
                    }
                });
            });
        },

        getAllSessionData: function (key) {
            return new Promise(function(resolve, reject) {
                $.ajax({
                    url: rbf_getAjaxURL(),
                    async: true,
                    data: {
                        cmd: 'getAllUserSessionData',
                    },
                    type: 'POST',
                    dataType: 'json',
                    traditional: true,
                    success: function(response) {
                        resolve(response);
                    },
                    error: function(xhr, status, error) {
                        reject(Error($(xhr.responseText).find('err').first().text()));
                    }
                });
            });
        },

        removeSessionData: function (key) {
            return new Promise(function(resolve, reject) {
                $.ajax({
                    url: rbf_getAjaxURL(),
                    async: true,
                    data: {
                        cmd: 'removeUserSessionData',
                        userJsonKeys: key == null ? key : key.toString()
                    },
                    type: 'POST',
                    dataType: 'text',
                    traditional: true,
                    success: function(response) {
                        resolve(response);
                    },
                    error: function(xhr, status, error) {
                        reject(Error($(xhr.responseText).find('err').first().text()));
                    }
                });
            });
        },

        removeAllSessionData: function (key) {
            return new Promise(function(resolve, reject) {
                $.ajax({
                    url: rbf_getAjaxURL(),
                    async: true,
                    data: {
                        cmd: 'removeAllUserSessionData',
                    },
                    type: 'POST',
                    dataType: 'text',
                    traditional: true,
                    success: function(response) {
                        resolve(response);
                    },
                    error: function(xhr, status, error) {
                        reject(Error($(xhr.responseText).find('err').first().text()));
                    }
                });
            });
        },

        updateRecord: function (objName, id, fieldMap, useIds, useLegacyDateFormat) {
            return new Promise(function(resolve, reject) {
                var data = {
                    cmd: 'apiUpdate',
                    useIds: useIds,
                    objName: objName,
                    useLegacyDateFormat: useLegacyDateFormat || ''
                };

                for (var fieldName in fieldMap) {
                    var fieldValue = fieldMap[fieldName];

                    if (typeof fieldValue === 'object') {
                        fieldValue = JSON.stringify(fieldValue);
                    }

                    data[fieldName] = fieldValue;
                }

                $.ajax({
                    url: rbf_getAjaxURL(),
                    data: data,
                    type: 'POST',
                    contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
                    traditional: true,
                    success: function(response) {
                        var $err = $(response).find('Error');
                        if ($err.length) {
                            reject(Error($err.text()));
                        } else {
                            resolve(response);
                        }
                    }
                });
            });
        },

        runTrigger: function (objName, id, triggerId, checkCondition, useLegacyDateFormat, options) {
            return new Promise(function(resolve, reject) {
                var data = {
                    cmd: 'apiRunTrigger',
                    objName: objName,
                    id: id,
                    eventId: triggerId,
                    useLegacyDateFormat: useLegacyDateFormat || ''
                };

                if (checkCondition != null && checkCondition === true) {
                    data.checkValidation = true;
                }

                if (options) {
                    data.options = JSON.stringify(options);
                }

                $.ajax({
                    url: rbf_getAjaxURL(),
                    data: data,
                    type: 'GET',
                    traditional: true,
                    success: function(response) {
                        var $err = $(response).find('Error');
                        if ($err.length) {
                            reject(Error($err.text()));
                        } else {
                            resolve(response);
                        }
                    }
                });
            });
        },

        removeFile: function (objName, id, fieldName) {
            return new Promise(function(resolve, reject) {
                var data = {
                    cmd: 'fileRemove',
                    objName: objName,
                    id: id,
                    name: fieldName
                };

                $.ajax({
                    url: rbf_getAjaxURL(),
                    data: data,
                    type: 'GET',
                    traditional: true,
                    success: function(response) {
                        var $err = $(response).find('Error');
                        if ($err.length) {
                            reject(Error($err.text()));
                        } else {
                            resolve(response);
                        }
                    }
                });
            });
        },
    }

    return rbx;
}(this.rbx = this.rbx || {}));