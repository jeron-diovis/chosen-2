/**
 * This is a fork of this plugin: https://github.com/harvesthq/chosen
 *
 * Styles and assets are copied form there. Javascript is completely rewritten. A lot of new features added.
 *
 * @author Jeron Diovis <void.jeron.diovis@gmail.com>
 * @license MIT license
 */
(function ($) {

	// -----------------------------------------------

	/**
	 * Main class. Implements data processing logic.
	 *
	 * @param select 'select' input
	 * @param options Object
	 * @constructor
	 */
	function Chosen(select, options) {
		var defaults = {
			search: {
				enabled: true, // if false, search field will not be created at all
				delay: 30, // min time between two search requests (milliseconds)
				minLength: 1, // min keyword length to start search
				bySubstr: true, // if false, search pattern will be prepended with '^' anchor
				splitWords: true, // if 'bySubstr' is true, this option is ignored; otherwise, search will split each label by spaces and test each word separately
				ajax: {
					enabled: false, // whether to request data from server

					/*
					 * If true, each keyword, for which search request was performed, will be saved internally,
					 * and in future requests for these keywords will not be performed again,
					 * because data is already exists in search list.
					 *
					 * Also, you still can force the request manually, by passing 'true' as second parameter to 'search' method
					 */
					cache: true,

					// params for jQuery.ajax. Options 'async' and 'success' cannot be set here
					config: {
						url: undefined, // required
						dataType: 'json'
					},

					mapping: {
						// { option property/attribute : field in response object }
						value: 'value',
						text: 'text'
					}
				}
			},

			singleMode: {
				allowDeselect: false // whether to create 'single-deselect' button in dropdown header
			},

			multiMode: {
				maxSelected: Infinity
			},

			createItems: {
				enabled: false
			},

			/*
			 * Specify template engine function you want.
			 * It will be used to render templates for search/choice list's items, and messages 'no result' and 'create new item'
			 *
			 * List's templates receives an 'option' node as argument,
			 * and message's templates receives an object { keyword: 'some string' } as argument.
			 */
			templateEngine: undefined,

			ui: {
				inheritCssClasses: true,
				closeOnBlur: true, // whether to hide dropdown when element outside of container becomes focused
				closeAfterChange: true, // whether to hide dropdown after selecting an item from it
				resetAfterClose: true, // whether to clear search field and reset highlighting in search list after hiding dropdown
				openAfterInit: false,

				placeholder: 'Select an option',

				multiMode: {
					choiceTemplate: '{text}',
					choiceContainerSelector: undefined, // allows to place choices in any element you wish
					useAutosuggestLayout: true,
					openAutosuggestOnClick: true,
					switchToChoicesOnBackspace: true, // whether to allow to switch focus to last choice by pressing backspace when container is empty
					blockDropdownOnLimitReached: false // denies to open dropdown when max allowed item count is selected
				},

				createItems: {
					selectCreated: false, // whether to set created item selected at once
					message: 'Create new item "{keyword}"'
				},

				groups: {
					allowCollapse: true,
					collapseOnInit: false
				},

				search: {
					tagName: 'ul',
					itemTemplate: '{text}',
					groupTemplate: '<i>{label}</i>',
					placeholder: 'Search for something',
					noResultsText: 'No results match "{keyword}"',
					forceHighlight: true, // if true, then when selection is empty, first matching result will be highlighted
					excludeDisabled: true, // if true, search items for disabled options will not be created; else they will be inactive
					ignoreSelected: true, // whether to consider selected items as not matching on search
					isCreatorMatches: true // if true, 'no results' message will not be displayed if item creator is displayed; ignored, if option 'createItems.enabled' is false
				}
			},

			// TODO: logger is very primitive, for now it will just log ALL events bindings and listeners
			logger: {
				enabled: false
			},

			/* This function will be called after all ui nodes are created and all system event listeners are binded,
			 * but before initial data will be applied (that is, pre-selected items will be rendered).
			 *
			 * It allows you to change standard plugin behavior by unbinding some events, replacing them with your own and so on.
			 *
			 * In fact, this method is created for you to group your own custom behavior changes in one place.
			 *
			 * 'this' inside will always refer to Chosen instance, so you can store your own changes everywhere and just assign that function to config
			 */
			beforeInit: function() {}
		};

		this.options = $.extend(true, defaults, options || {});
		this.log = $.proxy(utils.log, this.options.logger);

		// -------------------

		this.el = select;
		this.$el = $(this.el);

		// -------------------

		// for single-deselect ability, first option always must has an empty value (see 'chzn:single-select:set-selected')
		if (!this.el.multiple && this.options.singleMode.allowDeselect) {
			if (this.el.options[0].value.length > 0 || utils.isOptionDisabled(this.el.options[0])) {
				this.$el.prepend($('<option>', {
					'selected': false,
					'text': this.options.ui.placeholder,
					'value': '' // not null! if null, value will be set to text;
				}));
			}
		}

		// -------------------

		this.backup(this.el.options);

		// -------------------

		this.log('Creating ui...');
		this.ui = new ChosenUI(this, this.options.ui);

		// -------------------

		this.log('Initializing...');
		this.init();

		this.log('Ready');
	}

	$.extend(Chosen.prototype, {

		/**
		 * Binds event handlers to origin 'select' node, but replacing context to Chosen instance
		 *
		 * So, you can trigger events just from select, knowing nothing about internal plugin structure, but inside handler work already with this structure. So convenient.
		 *
		 * Note, if you bind events directly to select, then, of course, context will be a select, not Chosen.
		 *
		 * @returns {*}
		 */
		bind: function() {
			var chosen = this;
			function proxier(method) {
				return function() {
					chosen.log('Listen event: ', method, arguments);
					method.apply(chosen, arguments);
				};
			}

			if (arguments.length === 1) {
				// arguments == [ { event: handler, event: handler, ... } ]
				var originMethods = arguments[0],
					proxiedMethods = {};
				for (var methodName in originMethods) if (originMethods.hasOwnProperty(methodName)) {
					proxiedMethods[methodName] = proxier(originMethods[methodName]);
				}
				arguments[0] = proxiedMethods;
			} else {
				// arguments == [eventName, [eventData], handler]
				var handler = arguments[arguments.length - 1];
				if (typeof handler === 'function') {
					arguments[arguments.length - 1] = proxier(handler);
				}
			}

			$.fn.bind.apply(this.$el, arguments);
			this.log('Bind: ', arguments);
			return this;
		},

		unbind: function() {
			$.fn.unbind.apply(this.$el, arguments);
			return this;
		},

		trigger: function() {
			this.log('Trigger: ', arguments);
			$.fn.trigger.apply(this.$el, arguments);
			return this;
		},

		activate: function() {
			this.trigger('chzn:container:activate');
			this.trigger('chzn:dropdown:open');
			this.ui.keydownTarget.focus();

			return this;
		},

		deactivate: function() {
			this.trigger('chzn:container:deactivate');
			this.trigger('chzn:dropdown:close');
			this.ui.keydownTarget.blur();

			return this;
		},

		init: function() {
			this.options.beforeInit.call(this);

			var maxSelected = this.options.multiMode.maxSelected;
			if (this.el.multiple) {
				var selectedOptions = $(this.el.options).filter(':selected');
				if (selectedOptions.length > maxSelected) {
					selectedOptions.slice(maxSelected - selectedOptions.length).prop('selected', false);
				}
				this.options.multiMode.maxSelected = Infinity;
			}

			// TODO: need optimization, some 'batch select'. Too much events on start
			$.each(this.el.options, $.proxy(function(index, option) {
				if (option.selected) {
					this.selectItem(option.index);
				}
			}, this));

			this.options.multiMode.maxSelected = maxSelected;
			this.trigger('chzn:search-list:clear-highlight.sys');

			if (this.options.ui.groups.allowCollapse && this.options.ui.groups.collapseOnInit) {
				var optgorups = this.$el.children('optgroup');
				var indexes = $.map(optgorups, $.proxy($.fn.index, optgorups));
				if (indexes.length) {
					this.trigger('chzn:search-list:toggle-group', [indexes, true]);
				}
			}

			this.bind('chzn:option-selected.sys chzn:option-deselected.sys', $.proxy(function() {
				this.trigger('chzn:search-list:filter');
			}, this));

			if (this.options.ui.openAfterInit) {
				this.trigger('chzn:dropdown:open');
			}
		},

		reset: function(hard) {
			this.resetNewItems();

			var options = $(this.el.options);
			for (var propName in this.initialState) if (this.initialState.hasOwnProperty(propName)) {
				var propValues = this.initialState[propName];
				options.prop(propName, function(index) { return propValues[index]; });
			}

			if (hard) {
				options.prop({
					selected: false,
					disabled: false
				});
			}

			this.ui.searchField && this.ui.searchField.val('');
			this.ui.choiceList && this.ui.choiceList.children(this.ui.getChoiceSelector()).remove();
			this.trigger('chzn:search-list:compose-items');
			this.init();

			this.trigger('chzn:resetted', [hard]);

			return this;
		},

		isSelectionLimitReached: function() {
			return this.el.multiple && $(this.el.options).filter(':selected').length >= this.options.multiMode.maxSelected;
		},

		selectItem: function(index) {
			if (this.isSelectionLimitReached()) {
				this.trigger('chzn:max-selected');
				return false;
			}

			var option = this.el.options[index];
			option.selected = true;
			this.trigger('chzn:search-list:set-selected', [option.index, true]);

			if (!this.el.multiple) {
				this.trigger('chzn:single-select:set-selected', option);
			} else {
				this.trigger('chzn:choice-list:select', option);
			}

			this.trigger('chzn:option-selected', option);

			if (this.options.ui.closeAfterChange) {
				this.trigger('chzn:dropdown:close');
			}

			return this;
		},

		deselectItem: function(index) {
			var option = this.el.options[index];
			option.selected = false;
			this.trigger('chzn:search-list:set-selected', [option.index, false]);

			if (!this.el.multiple) {
				this.trigger('chzn:single-select:deselect');
			} else {
				this.trigger('chzn:choice-list:deselect', option);
			}

			this.trigger('chzn:option-deselected', option);

			return this;
		},

		/*enableItem: function(index) {
		 // TODO
		 },

		 disableItem: function(index) {
		 // TODO
		 },*/

		addItem: function(config, options) {
			config || (config = {});
			options = $.extend(true, { save: false }, options);

			if (!config.text) {
				throw new Error('Option label must be specified');
			}
			for (var i = 0, len = this.el.options.length; i < len; i++) {
				if (this.el.options[i].text === config.text) {
					throw new Error(utils.format('Options with label "{0}" already exists', [config.text]));
				}
			}

			config.value || (config.value = config.text); // just to explicit set tag attribute; internally, browser already sets value for you

			if (!options.save) {
				config.class ? (config.class += ' new') : (config.class = 'new');
			}

			var newOption = $('<option>', config);
			var optionNode = newOption.get(0);
			this.$el.append(newOption);
			this.ui.createSearchItem(optionNode).insertAfter(this.ui.searchList.children(this.ui.getSearchItemSelector()).last());
			if (optionNode.selected) {
				this.selectItem(optionNode.index);
			}

			this.trigger('chzn:option-created', [optionNode]);

			return this;
		},

		removeItem: function(index) {
			var option = this.el.options[index];
			if (!option) {
				throw new ReferenceError(utils.format('Option with index "{0}" does not exists', [index]));
			}

			this.ui.getSearchItemByOptionIndex(index)
				.nextAll(this.ui.getSearchItemSelector()).each(function() {
					$(this).data('option-index', $(this).data('option-index') - 1);
				}).end()
				.remove();

			for (var propName in this.initialState) {
				this.initialState[propName].splice(index, 1);
			}

			this.trigger('chzn:option-removed', [option, index]);

			option = $(option);
			var parent = option.parent();
			option.remove();
			if (parent.is('optgroup')) {
				var uiOptgroup = this.ui.getSearchItemGroupByOptionIndex(index);
				var dataKey = 'children-indexes';
				var children = parent.children('option');

				var isEmptyGroup = children.length === 0;
				var isEmptyUiGroup = children.length === children.filter(':disabled').length && this.options.ui.search.excludeDisabled;

				if (isEmptyUiGroup) {
					uiOptgroup.remove();
					if (isEmptyGroup) {
						parent.remove();
					}
				} else {
					var indexes = uiOptgroup.data(dataKey);
					indexes.splice($.inArray(index, uiOptgroup.data(dataKey)), 1);
					indexes = $.map(indexes, function(value) { return value - 1; } );
					uiOptgroup.data(dataKey, indexes);
				}
			}

			return this;
		},

		resetNewItems: function() {
			$.each(
				this.$el.children('option.new').map(function() { return this.index; }).toArray().reverse(),
				$.proxy(function(arrayIndex, optionIndex) { this.removeItem(optionIndex); }, this)
			);

			return this;
		},

		saveNewItems: function() {
			var options = this.$el.children('option.new');
			options.add(this.ui.getSearchItemByOptionIndex(options.map(function() { return this.index; }))).removeClass('new');
			this.backup(options, true);

			return this;
		},

		backup: function(options, update) {
			var result = (this.initialState || (this.initialState = {}));

			var prop = function(propName) { return function(obj) { return obj[propName]; } };
			$.each(['selected', 'disabled'], function(index, propName) {
				var values = $.map(options, prop(propName));
				result[propName] = update ? (result[propName] || []).concat(values) : values;
			});

			return this;
		},

		/**
		 * Returns indexes of options whose 'text' property matches to keyword, according to search options
		 *
		 * @param keyword string
		 * @returns {*}
		 */
		search: (function () {
			var escaper = new RegExp('[' + '\\' + ['.', '+', '*', '?', '-', '(', ')', '[', ']', '^', '$', '|', '\\'].join('\\') + ']', 'g');
			var requestsCache = []; // TODO: add ability to reset cache

			return function(keyword, forceRequest) {
				var chosen = this;
				var searchOptions = chosen.options.search;

				if (searchOptions.ajax.enabled && ( forceRequest || !searchOptions.ajax.cache || $.inArray(keyword, requestsCache) < 0) ) {
					var config = $.extend(true, {}, searchOptions.ajax.config, {
						async: false,
						success: function(response) {
							var mapper = function(item) {
								var itemConfig = {};
								for (var attributeName in searchOptions.ajax.mapping) {
									var remoteAttributeValue, remoteAttributeName = searchOptions.ajax.mapping[attributeName];
									if (typeof remoteAttributeName === 'function') {
										remoteAttributeValue = remoteAttributeName(item);
									} else {
										remoteAttributeValue = item[remoteAttributeName];
									}
									itemConfig[attributeName] = remoteAttributeValue;
								}
								return itemConfig;
							};
							response = $.map(response, mapper);

							// filter out received items which are already added to list
							var items = $.map($.map(chosen.el.options, mapper), $.param);
							response = $(response).filter(function() { return $.inArray($.param(this), items) < 0; }).toArray();

							requestsCache.push(keyword);
							$.each(response, function(index, obj) { chosen.addItem(obj, { save: true }); });
						}
					});
					$.ajax(config);
				}

				// escape regexp specchars
				var pattern = keyword.replace(escaper, '\\$&');
				if (!searchOptions.bySubstr) {
					pattern = '^' + pattern;
				}
				var flags = 'i';

				var regex = new RegExp(pattern, flags);
				return $.map(this.el.options, function(option) {
					var isMatch = false;

					if (searchOptions.bySubstr || !searchOptions.splitWords) {
						isMatch = regex.test(option.text);
					} else {
						var words = option.text.split(' ');
						for (var i = 0, len = words.length; i < len; i++) {
							isMatch = regex.test(words[i]);
							if (isMatch) break;
						}
					}

					if (isMatch) return option.index;
				});
			}
		})(),

		/**
		 * Serializes selected items, allowing to customize serializable attributes
		 * Result format depends on {@link wwwFormUrlEncoded} param.
		 *
		 * @param attributes string|array|object List of attributes to be serialized <br>
		 *      If string, must be a name of option property, or 'data-'-prefixed data property.
		 *      If array, each element must be a string in format, described above. This array will be transformed to an object, where keys and values are equals.
		 *      If object, keys must be any strings - they will be used as new property names in serialized data,
		 *          and values can be either strings in format, described above,
		 *          or functions - that function will receive option as argument and must return a serialized property value.
		 *
		 * @param wwwFormUrlEncoded bool Defines a format of returned value <br>
		 *     If true (by default) result will be an array in x-www-url-encoded format.
		 *         Array elements format depends on {@link attributes} param:
		 *          string: 'value' property equals to specified option's property, and 'name' property equals to input's name.
		 *          object: 'value' property equals to option's properties, specified by object's values,
		 *                  and 'name' property has following format: 'inputName[optionIndex][objectKey]'
		 *     If false, result also will be an array, and format also depends on {@link attributes} param:
		 *          string: values will be just a values of corresponding option's properties
		 *          object: values will be an objects, where keys equals to that object's keys, and values are values of option's properties, specified by that object's values.
		 *
		 * Anyway, you will understand this method's abilities faster if you just try to use it instead of reading of this comment.
		 *
		 * @returns {Array} Array
		 */
		smartSerialize: function(attributes, wwwFormUrlEncoded) {
			var baseSerialized = this.$el.serializeArray();
			var activeValues = $.map(baseSerialized, function(obj) { return obj.value; });
			var serializableItems = $(this.el.options).filter(function() { return $.inArray(this.value, activeValues) >= 0; });

			if (wwwFormUrlEncoded === undefined) {
				wwwFormUrlEncoded = true;
			}

			if (wwwFormUrlEncoded) {
				if (attributes === undefined) {
					return baseSerialized;
				}
				var elemName = this.el.name;
				var baseName = elemName.slice(-2) === '[]' ? elemName.slice(0, -2) : elemName;
			} else if (attributes === undefined) {
				attributes = 'value';
			}

			if (attributes.constructor === Array) {
				attributes = $.extend.apply($, [{}].concat($.map(attributes, function(attributeName) { var o = {}; o[attributeName] = attributeName; return o; })));
			}

			var result = [];
			serializableItems.each(function(index, option) {
				var itemConfig = {}, value;
				if (attributes.constructor === String) {
					value = utils.getAttribute(option, attributes);
					if (wwwFormUrlEncoded) {
						result.push({
							name: elemName,
							value: value
						});
					} else {
						result.push(value);
					}
				} else {
					for (var attributeAlias in attributes) if (attributes.hasOwnProperty(attributeAlias)) {
						var attributeName = attributes[attributeAlias];
						value = utils.getAttribute(option, attributeName);

						if (wwwFormUrlEncoded) {
							result.push({
								name: utils.format('{0}[{1}][{2}]', [baseName, index, attributeAlias]),
								value: value
							});
						} else {
							itemConfig[attributeAlias] = value;
						}
					}
					if (!wwwFormUrlEncoded) {
						result.push(itemConfig);
					}
				}
			});

			return result;
		}
	});

	// -----------------------------------------------

	/**
	 * Helper class, implements all work with UI.
	 *
	 * @param chosen Object 'Chosen' class instance
	 * @param options Object
	 * @constructor
	 */
	function ChosenUI(chosen, options) {
		this.options = options;
		this.chosen = chosen;

		// -----------------

		// shortcuts :
		this.el = this.chosen.el;
		this.$el = this.chosen.$el;
		this.bind = $.proxy(this.chosen.bind, this.chosen);
		this.unbind = $.proxy(this.chosen.unbind, this.chosen);
		this.trigger = $.proxy(this.chosen.trigger, this.chosen);
		this.log = this.chosen.log;

		// -----------------

		this.container = this.createContainer();
		this.searchList = this.createSearchList();
		this.dropdown = this.createDropdown().append(this.searchList);

		if (this.chosen.options.createItems.enabled) {
			this.itemCreator = this.createItemCreator().hide().appendTo(this.searchList);
		}

		var searchFieldWrapper, choiceListContainer;
		var isSearchEnabled = this.chosen.options.search.enabled;
		var isAutosuggest = this.isAutosuggest();

		if (!isAutosuggest) {
			this.dropdownHeader = this.createSingleSelectedItem();
			this.dropdownHeader.prependTo(this.container);
			choiceListContainer = this.container;
			if (isSearchEnabled) searchFieldWrapper = $('<div>', { 'class': 'chzn-search' }).prependTo(this.dropdown);
		} else {
			choiceListContainer = $('<div>', { 'class': 'chzn-autosuggest' });
			searchFieldWrapper = $(this.isChoicesOutside() ? '<div>' : this.getUiItemTag(), { 'class': 'search-field' });
			if (!isSearchEnabled) {
				this.dropdownHeader = $('<a>', {
					'class': 'autosuggest-placeholder',
					'href': 'javascript:void(0)'
				})
					.text(this.options.placeholder)
					.appendTo(searchFieldWrapper);
			}

			choiceListContainer.prependTo(this.container).append(searchFieldWrapper);
		}

		if (this.el.multiple) {
			this.choiceList = this.createChoiceList();
			if (this.isChoicesOutside()) {
				choiceListContainer = $(this.options.multiMode.choiceContainerSelector)
			}
			this.choiceList.prependTo(choiceListContainer);
		}

		if (isSearchEnabled) {
			this.searchField = this.createSearchField();
			this.keydownTarget = this.searchField;
			searchFieldWrapper.html(this.searchField);
		} else {
			this.keydownTarget = this.dropdownHeader;
		}

		if (isAutosuggest) {
			if (isSearchEnabled) {
				this.dropdownHeader = this.searchField;
			}
			if (this.el.multiple && !this.isChoicesOutside()) {
				this.choiceList.append(searchFieldWrapper);
			}

			this.bind('chzn:search-list:filtered.sys', function() {
				if (!this.ui.dropdown.is(':visible')) {
					this.trigger('chzn:dropdown:open');
				}
			});

			if (this.options.multiMode.openAutosuggestOnClick) {
				var opener = $.proxy(this.trigger, this, 'chzn:dropdown:open');
				this.dropdownHeader.click(opener);
				if (!this.isChoicesOutside()) {
					this.choiceList.on('click', function(e) {
						if (e.target === e.currentTarget) {
							opener();
						}
					});
				}
			}
		}

		this.container.append(this.dropdown).insertAfter(this.$el);

		// -------------------------

		this.$el.hide();
		this.initCss(); // call it AFTER container is rendered, to apply all styles first
		this.bindKeydownHandler();
	}

	$.extend(ChosenUI.prototype, {

		// utils :

		getUiItemTag: function(nameOnly) {
			var tag = this.options.search.tagName.toLowerCase() === 'ul' ? 'li' : 'div';
			if (!nameOnly) {
				tag = utils.format('<{0}>', [tag]);
			}
			return tag;
		},

		getSearchItemSelector: function() {
			return this.getUiItemTag(true) + '.search-result';
		},

		getSearchItemGroupSelector: function() {
			return this.getUiItemTag(true) + '.group-result';
		},

		getChoiceSelector: function() {
			return this.getUiItemTag(true) + '.search-choice';
		},

		getUiElementByOptionIndex: function(index, container, itemSelector) {
			var isArray = $.isArray(index);
			var items = container.children(itemSelector);
			return items.filter(function() {
				var dataIndex = $(this).data('option-index');
				return isArray ? ($.inArray(dataIndex, index) >= 0) : (dataIndex === index);
			});
		},

		getSearchItemByOptionIndex: function(index) {
			return this.getUiElementByOptionIndex(index, this.searchList, this.getSearchItemSelector());
		},

		getChoiceByOptionIndex: function(index) {
			return this.getUiElementByOptionIndex(index, this.choiceList, this.getChoiceSelector());
		},

		getSearchItemGroupByOptionIndex: function(index) {
			return this.searchList.children(this.getSearchItemGroupSelector()).filter(function() {
				if (index.constructor !== Array) {
					index = [index];
				}
				for (var i = 0, len = index.length; i < len; i++) {
					if ($.inArray(index[i], $(this).data('children-indexes')) >= 0) {
						return true;
					}
				}
				return false;
			});
		},

		getSearchItemsFromGroup: function(optgroup) {
			optgroup = $(optgroup);
			var indexes;
			if (optgroup.is('optgroup')) {
				indexes = $.map(optgroup.children('option'), function(option) { return option.index; })
			} else {
				indexes = optgroup.data('children-indexes');
			}
			return this.getSearchItemByOptionIndex(indexes);
		},

		getOptionForSearchItem: function(item) {
			item = $(item);
			var indexes = $.map(item, function(item) { return $(item).data('option-index'); });
			return $(this.el.options).filter(function() {
				return $.inArray(this.index, indexes) >= 0;
			}).toArray();
		},

		composeRenderAttributes: function(obj) {
			return $.extend(true, {}, obj, { data: $(obj).data() });
		},

		render: function(template, data, defaults) {
			var content,
				templateEngine = this.chosen.templateEngine;
			if (!templateEngine) {
				content = utils.format(template, data, defaults);
			} else {
				content = templateEngine(template, data);
			}
			return content;
		},

		isAutosuggest: function() {
			return this.el.multiple && this.options.multiMode.useAutosuggestLayout;
		},

		isChoicesOutside: function() {
			return this.options.multiMode.choiceContainerSelector !== undefined;
		},

		// create base widget nodes :

		createContainer: function() {
			var activeContainerClass = 'chzn-container-active';

			var classes = [
				'chzn-container'
			];
			if (this.isAutosuggest()) {
				classes.push('autosuggest');
			} else {
				classes.push('chzn-container-single');
			}
			if (this.el.multiple) {
				classes.push('chzn-container-multi');
			}
			if (this.options.inheritCssClasses) {
				classes.push(this.el.className);
			}

			var chosenUI = this;

			function isInsideContainer(event, isActivating) {
				// deny to activate container on _direct_ click on choice list - because, in common case, choice list is independent node, not inside container
				if (!chosenUI.isAutosuggest() && chosenUI.el.multiple && event.target === chosenUI.choiceList.get(0)) return false;

				// TODO: refactor this, use 'closest'
				var node = $(event.target);
				var parentsInside = node.parentsUntil(chosenUI.container);
				var parents = parentsInside.andSelf().add(parentsInside.last().parent());
				var isInside = parents.is(container);

				isInside = isInside && !parents.is(chosenUI.getChoiceSelector());

				/**
				 * If container must be deactivated on this event - allow to prevent deactivation, if event is triggered by 'remove choice' button.
				 * Due to this, we can remove choices wherever they are (even outside of container) without container deactivation.
				 * And in the same time, we prevent to activate container by clicking 'remove choice' button, even if it is inside container
				 */
				if (!isActivating) {
					isInside = isInside || (chosenUI.el.multiple && parents.is('.search-choice-close'));
					if (chosenUI.isAutosuggest()) {
						isInside = isInside || parents.is(chosenUI.getChoiceSelector());
					}
				}

				return isInside;
			}

			function getFocusTarget() {
				return chosenUI[chosenUI.dropdown.is(':visible') ? 'keydownTarget' : 'dropdownHeader'];
			}

			var container = $('<div>', {
				'id': utils.generateRandomId(),
				'class': classes.join(' '),
				'title': this.el.title
			})
				.on('click.chzn:container:watch-focus', '*', function(e) {
					// emulate 'stopPropagation', to do not perform same handling multiple times, but allow use external listeners
					if (e.target !== e.currentTarget) return;

					if (!isInsideContainer(e, true)) return;

					// wherever you click inside container, it always must be active - has corresponding css classes and has a keydown watcher focused
					chosenUI.trigger('chzn:container:activate');
				});

			var blurEventName = 'click.chzn:container:blur-watcher';
			this.bind({
				'chzn:container:activate': function () {
					getFocusTarget().focus();
				},

				// more wide events hear all sub-events, but not vice versa; so by triggering 'chzn:container:activate' you activate both highlighting and focus
				'chzn:container:activate.highlight': function () {
					chosenUI.container.addClass(activeContainerClass);
					// set timeout to allow 'click' event to bubble first - otherwise, if 'activate' event was triggered on click somewhere, binded handler will be triggered at once
					setTimeout(function() {
						chosenUI.log('info', 'Enable global container blur watcher');
						$(document).off(blurEventName).on(blurEventName, function(e) {
							// event target is somewhere outside of container
							if (!isInsideContainer(e)) {
								chosenUI.log('info', 'Activate global container blur watcher');
								if (chosenUI.options.closeOnBlur) {
									chosenUI.chosen.deactivate();
								} else {
									chosenUI.trigger('chzn:container:deactivate');
									chosenUI.trigger('chzn:search-list:clear-highlight');
								}
							}
						});
					}, 10);
				},

				'chzn:container:deactivate': function () {
					getFocusTarget().blur();
				},

				'chzn:container:deactivate.highlight': function () {
					chosenUI.container.removeClass(activeContainerClass);
					chosenUI.log('info', 'Disable global container blur watcher');
					$(document).off(blurEventName);
				}
			});

			return container;
		},

		createDropdown: function() {
			var dropdown = $('<div>', {
				'class': "chzn-drop",
				'style': "display:none"
			});

			var classes = {
				container: 'chzn-container-active',
				selectedItem: 'chzn-single-with-drop'
			};

			var chosenUI = this;

			// TODO: deprecated; refactor
			var visibilityToggler = $.proxy(function(cssClassMethod) {
				if (!chosenUI.isAutosuggest()) {
					chosenUI.dropdownHeader && chosenUI.dropdownHeader[cssClassMethod](classes.selectedItem);
				} else {

				}
			}, dropdown);

			this.bind({
				'chzn:dropdown:open': function() {
					if (this.options.ui.multiMode.blockDropdownOnLimitReached && this.isSelectionLimitReached()) {
						this.trigger('chzn:max-selected.dropdown-open');
						return;
					}
					visibilityToggler('addClass');
					dropdown.show();
				},

				'chzn:dropdown:close': function() {
					// TODO: behavior subscription
					if (this.options.ui.resetAfterClose) {
						this.ui.searchField && this.ui.searchField.val('');
						this.trigger('chzn:search-list:reset-filter');
					}
					this.ui.itemCreator && this.ui.itemCreator.removeClass('highlighted');

					visibilityToggler('removeClass');
					dropdown.hide();
				},

				'chzn:dropdown:toggle': function(e, state) {
					var eventName = (typeof state === "boolean" ? state : dropdown.is(':hidden')) ? 'open' : 'close';
					this.trigger('chzn:dropdown:' + eventName);
				}
			});

			return dropdown;
		},

		createSearchField: function() {
			var searchField = $('<input>', {
				'type': 'text',
				'placeholder': this.options.search.placeholder,
				'class': 'default',
				'autocomplete': 'off'
			});

			var chosenUI = this;
			var handler, prevValue = '', isFiltered = false;
			searchField.keyup(function() {
				// emulate 'onChange' without loosing focus
				if (this.value != prevValue) {
					$(this).toggleClass('default', this.value.length === 0);

					if (this.value.length < chosenUI.chosen.options.search.minLength) {
						if (isFiltered) {
							chosenUI.trigger('chzn:search-list:reset-filter', true);
							isFiltered = false;
						}
					} else {
						clearTimeout(handler);
						handler = setTimeout($.proxy(chosenUI.trigger, chosenUI, 'chzn:search-list:filter', this.value), chosenUI.chosen.options.search.delay);
						isFiltered = true;
					}
				}
				prevValue = this.value;
			});

			return searchField;
		},

		createSearchList: function() {
			var list = $(utils.format('<{0}>', [this.options.search.tagName]), {
				'class': 'chzn-results'
			});

			// ---------------------------

			var noResultsMessage = $(this.getUiItemTag(), {
				'class': 'no-results'
			}).hide();
			list.append(noResultsMessage);

			// ---------------------------

			var classes = {
				'highlighted': 'highlighted',
				'selected': 'selected',
				'selectable': 'selectable',
				'noMatch': 'no-match',
				'collapsed': 'item-collapsed',
				'groupCompleted': 'all-selected',
				'groupCollapsed': 'group-collapsed'
			};

			var resultSelector = this.getSearchItemSelector();
			var selectableResultsSelector = this.getUiItemTag(true) + '.' + classes.selectable;
			var groupSelector = this.getSearchItemGroupSelector();

			//------------------------------------

			function getSearchItems() {
				return list.children(resultSelector);
			}

			function getSearchItemGroups() {
				return list.children(groupSelector);
			}

			//------------------------------------

			list
				.on('click.chzn:search:select-item', resultSelector + '.' + classes.highlighted,
					$.proxy(function(e) { this.chosen.selectItem($(e.currentTarget).data('option-index')); }, this)
				)
				.on({
					'mouseover.chzn:search:highlight': function() { $(this).addClass(classes.highlighted).siblings().removeClass(classes.highlighted); },
					'mouseleave.chzn:search:unhighlight': function() { $(this).removeClass(classes.highlighted); }
				},
				selectableResultsSelector
			);

			if (this.options.groups.allowCollapse) {
				list.on('click.chzn:search:toggle-group', '.group-result',  { chosenUI: this }, function(e) {
					e.data.chosenUI.trigger('chzn:search-list:toggle-group', [getSearchItemGroups().index(e.currentTarget)]);
				});
			}

			//------------------------------------

			// TODO: something strange
			var highlightSelected = (function () {
				var isMultiple = this.el.multiple;
				return function () {
					if (isMultiple) return;
					getSearchItems().filter('.' + classes.selected + ':visible').addClass(classes.highlighted);
				};
			}).call(this);

			// TODO: behavior subscription
			if (this.options.resetAfterClose) {
				this.bind('chzn:dropdown:open.sys', function() {
					getSearchItems().removeClass(classes.highlighted);
					highlightSelected();
				});
			}

			//------------------------------------

			this.bind('chzn:search-list:compose-items', { chosenUI: this }, function(e, indexes) {
				indexes || (indexes = []);

				var chosenUI = e.data.chosenUI;
				var optionsList = $(chosenUI.el.options);
				if (indexes.length) {
					optionsList = optionsList.filter(function() { return $.inArray(this.index, indexes) >=0; });
				}
				if (chosenUI.options.search.excludeDisabled) {
					optionsList = optionsList.filter(function() { return !utils.isOptionDisabled(this); });
				}
				if (!chosenUI.el.multiple && chosenUI.chosen.options.singleMode.allowDeselect) {
					optionsList = optionsList.slice(1);
				}
				list.children(chosenUI.getSearchItemSelector()).remove();
				var options = $.map(optionsList, $.proxy(chosenUI.createSearchItem, chosenUI));
				list.prepend(options);

				list.children(chosenUI.getSearchItemGroupSelector()).remove();
				var optgroups = $.map(chosenUI.$el.children('optgroup'), $.proxy(chosenUI.createSearchItemsGroup, chosenUI));
				options = $(options).map(function() { return this.get(0); });
				$.each(optgroups, function() {
					var optgroup = $(this);
					var children = options.filter(function() { return $.inArray($(this).data('option-index'), optgroup.data('children-indexes')) >= 0; });
					if (chosenUI.options.search.excludeDisabled) {
						children = children.not(':disabled');
					}
					optgroup.insertBefore(children.first());
				});
			});

			this.bind({
				'chzn:search-list:move-selection': function(e, forward, onListEnd) {
					var items = list.children(selectableResultsSelector);
					var movementResult = utils.moveListSelection({
						items: items,
						highlightedClass: classes.highlighted,
						forward: forward,
						onListEnd: onListEnd,
						filter: function() { return $(this).hasClass(classes.selectable); } // include all selectable items in list, not only search items
					});
					if (movementResult.movedTo.length) {
						var eventName = 'mousemove.chzn:watch-selection';
						// if you select some item by mouse, and then move selection by keyboard - on first mouse movement selection must return back under mouse
						movementResult.movedFrom.unbind(eventName).bind(eventName, function() {
							items.unbind(eventName);
							$(this).trigger('mouseover');
						});
					}
				},

				'chzn:search-list:highlight': function(e, index, useDataIndex) {
					var items = list.children(selectableResultsSelector);
					var highlightedItem = !useDataIndex ? items.eq(index) : this.ui.getSearchItemByOptionIndex(index);
					if (!highlightedItem.length) {
						// in single-deselect mode search item for zero option does not exits. But for convenience we do not raise an error - to do not break your custom behavior by one option changing
						if (useDataIndex && index === 0 && this.options.singleMode.allowDeselect) {
							return;
						}
						throw new ReferenceError(utils.format('Item with index "{0}" does not exist', [index]));
					}
					if (highlightedItem.prop('disabled')) {
						return;
					}
					items.removeClass(classes.highlighted);
					highlightedItem.addClass(classes.highlighted)
				},

				'chzn:search-list:clear-highlight': function() {
					getSearchItems().add(this.ui.itemCreator).add(getSearchItemGroups()).removeClass(classes.highlighted);
				},

				'chzn:search-list:set-selected': function(e, index, isSelected) {
					var items = getSearchItems();
					var selectedItem = this.ui.getSearchItemByOptionIndex(index);
					selectedItem[isSelected ? 'addClass' : 'removeClass'](classes.selected);
					if (this.el.multiple) {
						if (isSelected) {
							this.trigger('chzn:search-list:move-selection', [true, 'rerun']);
						}
					}
					if (isSelected && !this.el.multiple) { items.not(selectedItem).removeClass(classes.selected); }

					var group = this.ui.getSearchItemGroupByOptionIndex(index);
					var groupOptions = this.ui.getOptionForSearchItem(this.ui.getSearchItemsFromGroup(group));
					var isAllSelected = groupOptions.length === $(groupOptions).filter(':selected').length;
					group[isAllSelected ? 'addClass' : 'removeClass'](classes.groupCompleted);
				},

				'chzn:search-list:toggle-group': function(e, index, isCollapsed) {
					if (index.constructor !== Array) {
						index = [index];
					}
					var groups = getSearchItemGroups();
					$.each(index, $.proxy(function(i, index) {
						var group = groups.eq(index);
						if (isCollapsed === undefined) {
							isCollapsed = !group.hasClass(classes.groupCollapsed); // invert
						}
						group.toggleClass(classes.groupCollapsed, isCollapsed);
						this.ui.getSearchItemsFromGroup(group).toggleClass(classes.collapsed, isCollapsed);
						this.trigger('chzn:search-list:group-toggled', [index, isCollapsed, group]);
					}, this));
				},

				'chzn:search-list:reset-filter': function(e, preserveSelection) {
					var items = getSearchItems();
					if (!preserveSelection) {
						items.removeClass(classes.highlighted);
					}
					items.removeClass(classes.noMatch);
					this.ui.searchList.children(this.ui.getSearchItemGroupSelector()).removeClass(classes.groupCompleted);
					noResultsMessage.hide().empty();
					this.ui.itemCreator && this.ui.itemCreator.hide().empty();
				},

				'chzn:search-list:filter': function(e, keyword) {
					if (keyword === undefined) {
						keyword = this.options.search.enabled ? this.ui.searchField.val() : '';
					}

					if (!keyword.length) {
						this.trigger('chzn:search-list:reset-filter', true);
						return;
					}

					var indexes = this.search(keyword);
					if (this.options.ui.search.ignoreSelected) {
						indexes = $(indexes).not(this.$el.children(':selected').map(function() { return this.index; })).toArray();
					}
					var matchingItems = this.ui.getSearchItemByOptionIndex(indexes);

					var searchItems = getSearchItems();

					matchingItems.removeClass(classes.noMatch);
					searchItems.not(matchingItems).addClass(classes.noMatch);

					var optgroups = this.ui.searchList.children(this.ui.getSearchItemGroupSelector());
					var matchingGroups = optgroups.filter(
						this.ui.getSearchItemGroupByOptionIndex(
							$.map(
								matchingItems.filter(utils.format(':not(.{0}, .{1})',[classes.selected, classes.noMatch])),
								function(item) { return $(item).data('option-index'); }
							)
						)
					);
					matchingGroups.removeClass(classes.groupCompleted);
					optgroups.not(matchingGroups).addClass(classes.groupCompleted);

					if (this.options.createItems.enabled) {
						var isExactMatch = $(this.el.options).is(function() { return this.text.toLowerCase() === keyword.toLowerCase(); });
						if (!isExactMatch) {
							this.ui.itemCreator.html(utils.format(this.ui.options.createItems.message, { keyword: utils.htmlHelper.encode(keyword) })).show();
						} else {
							this.ui.itemCreator.hide().empty();
						}
					}

					if (matchingItems.length == 0 && !(this.options.createItems.enabled && this.options.ui.search.isCreatorMatches && !isExactMatch)) {
						noResultsMessage.html(utils.format(this.options.ui.search.noResultsText, {keyword: utils.htmlHelper.encode(keyword)})).show();
					} else {
						noResultsMessage.hide().empty();
					}

					this.trigger('chzn:search-list:filtered', [keyword, matchingItems.length]);
					searchItems.filter('.' + classes.highlighted).not(':visible').add(this.ui.itemCreator).removeClass(classes.highlighted);
					if (this.options.ui.search.forceHighlight && !searchItems.filter('.' + classes.highlighted).length) {
						this.trigger('chzn:search-list:move-selection', [true]);
					}
				}
			});

			this.trigger('chzn:search-list:compose-items');

			return list;
		},

		createSearchItem: function(option) {
			var item = $(this.getUiItemTag(), {
				'class': 'search-result'
			})
				.data('option-index', option.index);

			item.html(this.render(this.options.search.itemTemplate, this.composeRenderAttributes(option)));

			var additionalClasses = [];
			if (option.className) {
				additionalClasses.push(option.className);
			}
			if (option.parentElement.tagName === 'OPTGROUP') {
				additionalClasses.push('group-option');
			}
			if (!utils.isOptionDisabled(option)) {
				additionalClasses.push('selectable');
			} else {
				item.find(':input').andSelf().prop('disabled', true);
				additionalClasses.push('disabled');
			}
			if (option.selected) {
				additionalClasses.push('selected');
			}
			if (additionalClasses.length) {
				item.addClass(additionalClasses.join(' '));
			}

			return item;
		},

		createSearchItemsGroup: function(optgroup) {
			var item = $(this.getUiItemTag(), {
				'class': 'group-result'
			})
				.data('children-indexes', $.map(optgroup.children, function(option) { return option.index; }))
				.data('node', optgroup);

			item.html(this.render(this.options.search.groupTemplate, this.composeRenderAttributes(optgroup)));

			if (this.options.groups.allowCollapse) {
				item.addClass('selectable');

				var toggler = $('<a>', {
					'class': 'group-toggler'
				});
				toggler.appendTo(item);
			}

			return item;
		},

		createSingleSelectedItem: function() {
			var isSingleDeselectAllowed, singleDeselectBtn;

			var selectedItem = $('<a>', {
				'href': 'javascript:void(0)',
				'class': 'chzn-single chzn-default',
				'tabindex': -1
			})
				.append([
					$('<span>', { 'class': 'dropdown-text' }).text(this.options.placeholder),
					$('<div>', { 'class': 'dropdown-icon' }).append(document.createElement('b'))
				]);

			selectedItem.on('focus', false); // prevent to show a browser's default border around active link

			var chosenUI = this;
			selectedItem.click(function(e) {
				//TODO: bad code =( ; it prevents to open dropdown by clicking 'single-deselect' button
				if (isSingleDeselectAllowed && e.target === singleDeselectBtn.get(0) && (!(chosenUI.dropdown.is(':visible') && chosenUI.options.closeAfterChange ))) { return; }

				chosenUI.trigger('chzn:dropdown:toggle');
			});

			isSingleDeselectAllowed = this.chosen.options.singleMode.allowDeselect;
			if (isSingleDeselectAllowed && this.el.multiple) {
				throw new Error('"singleMode.allowDeselect" option is unavailable in multi-mode');
			}

			this.bind({
				'chzn:single-select:set-selected': function(event, option) {
					selectedItem.children('.dropdown-text:first').text(option.text);
					var isEmptyOption = !option.value && option.index === 0;
					selectedItem[isEmptyOption && isSingleDeselectAllowed ? 'addClass' : 'removeClass']('chzn-default');
					if (isSingleDeselectAllowed) {
						singleDeselectBtn[isEmptyOption ? 'hide' : 'show']();
					}
				}
			});

			if (isSingleDeselectAllowed) {
				// in native dropdown, when no options selected, first option sets selected automatically; we do the same
				this.bind({ 'chzn:single-select:deselect': $.proxy(this.chosen.selectItem, this.chosen, 0) });

				singleDeselectBtn = $('<span>', { 'class': 'single-deselect' })
					.hide()
					.insertBefore(selectedItem.children().last());

				singleDeselectBtn.click($.proxy(this.trigger, this, 'chzn:single-select:deselect'))
			}

			return selectedItem;
		},

		createItemCreator: function() {
			if (!this.chosen.options.createItems.enabled) {
				throw new Error('Items creation is not allowed by configuration');
			}

			var itemCreator = $(this.getUiItemTag(), {
				'class': 'create-item-msg selectable'
			});

			var chosen = this.chosen;

			var itemCreatedEventName = 'chzn:option-created.creator-listener';
			// listener unbinds self after executing. Due to this, it will not be triggered when you add item manually (through '.data("chosen").addItem(...)')
			var itemCreatedListener = function(e, option) {
				itemCreator.hide();
				this.trigger('chzn:search-list:highlight', [option.index, true]);
				chosen.unbind(itemCreatedEventName);
			};

			var activator = function() {
				var keyword = chosen.ui.searchField.val();
				chosen.bind(itemCreatedEventName, itemCreatedListener);
				chosen.addItem({
					text: keyword,
					selected: chosen.ui.options.createItems.selectCreated
				});
			};

			itemCreator.click(function() { $(this).trigger('activate'); });

			return itemCreator;
		},

		createChoiceList: function() {
			if (!this.el.multiple) {
				throw new Error('Choice list node can be created only for multiple select');
			}
			var chosenUI = this;

			var list = $('<ul>', {
				'class': 'chzn-choices'
			});

			var classes = {
				'choice': 'search-choice',
				'choiceClose': 'search-choice-close',
				'choiceSelected': 'selected',
				'choiceDisabled': 'disabled'
			};

			var choiceSelector = chosenUI.getChoiceSelector();
			var selectedChoiceSelector = choiceSelector + '.' + classes.choiceSelected;
			var deselectBtnSelector = '.' + classes.choiceClose;

			var blurEventName = 'click.chzn:choice-list.blur';
			function bindChoiceBlurWatcher() {
				$(document).off(blurEventName);

				// set timeout to allow 'click' event to bubble first - otherwise binded handler will be triggered at once
				setTimeout(function() {
					$(document).on(blurEventName, function(e) {
						var self = $(e.target);
						// click not on any choice
						var isChoice = self.parentsUntil(chosenUI.getChoiceSelector()).add(self.parent()).andSelf().is(choiceSelector);
						if (!isChoice) {
							list.children(choiceSelector).removeClass(classes.choiceSelected);
							$(document).off(blurEventName);
						}
					});
				}, 10);
			}

			list.on('keydown', deselectBtnSelector, function(e) {
				switch (e.keyCode) {
					case 8:
						e.preventDefault();
						chosenUI.trigger('chzn:choice-list:deselect-highlighted');
						chosenUI.trigger('chzn:container:activate');
						break;
					case 27:
						$(document).trigger(blurEventName);
						chosenUI.trigger('chzn:container:activate');
						break;
					default:
					// no action
				}
			});

			list.on('click.chzn:choice.deselect', deselectBtnSelector, function(e) {
				/* set timeout to allow 'click' event to bubble first - to trigger global container and document blur watchers.
				 * It is required, because if first to remove item, then when event bubbles, event.target will not have a parents (node is removed)
				 * - so such click will be interpreted as click outside of container, and blur watcher will be fired */
				setTimeout(function() {
					chosenUI.chosen.deselectItem($(e.target).closest(chosenUI.getChoiceSelector()).data('option-index'));

					// if container is active, it returns focus back to corresponding node (search field or dropdown header)
					if (chosenUI.container.hasClass('chzn-container-active')) {
						chosenUI.trigger('chzn:container:activate');
					}
				}, 10);
			});

			list.on('click.chzn:choice.focus', choiceSelector, function(e) {
				var choice = $(e.currentTarget);
				if (choice.hasClass(classes.choiceDisabled)) {
					return;
				}
				choice.find(deselectBtnSelector).focus();

				var choices = list.children(choiceSelector);
				if (e.ctrlKey) {
					choice.toggleClass(classes.choiceSelected);
				} else {
					if (!choice.hasClass(classes.choiceSelected)) {
						choice.addClass(classes.choiceSelected)
					} else {
						if (choices.filter(selectedChoiceSelector).length < 2) {
							choice.removeClass(classes.choiceSelected)
						}
					}
					choices.not(choice).removeClass(classes.choiceSelected);
				}
				if (chosenUI.isAutosuggest() && !chosenUI.isChoicesOutside()) {
					chosenUI.trigger('chzn:container:activate.highlight');
					if (!choices.filter(selectedChoiceSelector).length) {
						chosenUI.keydownTarget.focus();
					}
				}
				bindChoiceBlurWatcher();
			});

			function unrenderChoice(e, option) {
				chosenUI.getChoiceByOptionIndex(option.index).remove();
			}

			this.bind({
				'chzn:choice-list:select': function(e, option) {
					var newChoice = this.ui.createChoice(option);
					if (!this.ui.isAutosuggest() || this.ui.isChoicesOutside()) {
						this.ui.choiceList.append(newChoice);
					} else {
						this.ui.dropdownHeader.parent().before(newChoice);
					}
				},

				'chzn:choice-list:deselect-highlighted': function() {
					list.children(selectedChoiceSelector).each(function() {
						chosenUI.chosen.deselectItem($(this).data('option-index'));
					});
				},

				'chzn:choice-list:deselect': unrenderChoice,
				'chzn:option-removed': unrenderChoice,

				'chzn:choice-list:move-selection': function(e, forward, onListEnd, options) {
					options || (options = {});
					var items = list.children(choiceSelector);
					var movementResult = utils.moveListSelection({
						items: items,
						highlightedClass: classes.choiceSelected,
						forward: forward,
						onListEnd: onListEnd,
						filter: function() { return !$(this).hasClass(classes.choiceDisabled); }
					});
					if (movementResult.movedTo.length) {
						if (options.focus) {
							movementResult.movedTo.find(deselectBtnSelector).focus();
						}
						if (options.setBlurWatcher) {
							bindChoiceBlurWatcher();
						}
					}
				}
			});

			return list;
		},

		createChoice: function(option) {
			var item = $(this.getUiItemTag(), {
				'class': 'search-choice'
			})
				.data('option-index', option.index)
				.append($('<span>').html(this.render(this.options.multiMode.choiceTemplate, this.composeRenderAttributes(option))));

			if ($(option).data('fixed')) {
				item.addClass('disabled');
			} else {
				var deselectButton = $('<a>', {
					'class': 'search-choice-close',
					'href': 'javascript:void(0)'
				});
				item.append(deselectButton);
			}

			return item;
		},

		initCss: function() {
			this.container.width(this.$el.outerWidth());
			if (this.isAutosuggest()) {
				var text;
				if (this.searchField) {
					text = this.options.search.placeholder;
				} else {
					text = this.options.placeholder;
				}
				(this.searchField || this.dropdownHeader).parent().css({
					'min-width': utils.getTextWidth(text)
				});
			}
		},

		bindKeydownHandler: function() {
			var chosenUI = this;

			this.keydownTarget.keydown(function(e) {
				var self = $(this);

				var highlightedItem = chosenUI.searchList.children('.highlighted'); // TODO: css dependency
				var groupSelector = chosenUI.getSearchItemGroupSelector();
				var isGroup = highlightedItem.is(groupSelector);

				switch (e.keyCode) {
					// arrows up-down
					case 38:
					case 40:
						e.preventDefault(); // if keydownTarget is single-selected-item (tag <a>), it prevents to move focus to other nodes
						var isForward = e.keyCode === 40;
						if (chosenUI.dropdown.is(':visible')) {
							if (e.ctrlKey) {
								if (isGroup) {
									chosenUI.trigger('chzn:search-list:toggle-group', [highlightedItem.index(groupSelector), !isForward])
								}
							} else {
								// on forward movement, selection can circulate through list; on backward, it will disappear after reaching top of list
								chosenUI.trigger('chzn:search-list:move-selection', [isForward, isForward ? 'rerun' : 'clear']);
							}
						} else {
							isForward && chosenUI.trigger('chzn:dropdown:open'); // open dropdown by pressing arrow down
						}
						break;
					case 27: // esc
						chosenUI.trigger('chzn:dropdown:close');
						chosenUI.dropdownHeader.focus();
						break;
					case 13: // enter
						e.preventDefault(); //prevent to submit form, if it exists
						if (highlightedItem.length) {
							if (isGroup) {
								chosenUI.trigger('chzn:search-list:toggle-group', [highlightedItem.index(groupSelector)])
							} else if (!highlightedItem.is(chosenUI.itemCreator)) {
								chosenUI.chosen.selectItem(highlightedItem.data('option-index'));
							} else {
								highlightedItem.trigger('activate');
							}
						}
						break;
					case 8: // backspace
						if (!self.is(chosenUI.searchField) || self.val().length === 0) {
							e.preventDefault(); // prevent to navigate browser
							if (chosenUI.el.multiple) {
								if (chosenUI.options.multiMode.switchToChoicesOnBackspace && chosenUI.choiceList.children(chosenUI.getChoiceSelector() + ':not(.disabled)').length > 0) {
									chosenUI.trigger('chzn:choice-list:move-selection', [false, 'rerun', { focus: true, setBlurWatcher: true }]);
								} else if (chosenUI.isAutosuggest()) {
									chosenUI.trigger('chzn:container:deactivate');
								}
							}
						}
						break;
					default:
					// no action
				}
			});

			if (!this.isAutosuggest() && this.chosen.options.search.enabled) {
				this.dropdownHeader.keydown(function(e) {
					switch (e.keyCode) {
						case 13: // enter
							e.preventDefault(); // prevent to open dropdown by pressing enter
							break;
						case 40: // arrow down
							e.preventDefault();
							chosenUI.chosen.activate();
							break;
						case 8: // backspace
							e.preventDefault();
							chosenUI.trigger('chzn:container:deactivate');
							break;
						default:
						// no action
					}
				});
			}
		}
	});

	// -----------------------------------------------

	$.fn.chosen = function(options) {
		var match = /(msie) ([\w.]+)/.exec(navigator.userAgent.toLowerCase()) || [];
		var browser = {
			name: match[1] || "",
			version: match[2] || "0"
		};
		if (browser.name === "msie" && parseInt(browser.version) < 8) {
			return this;
		}

		return this.each(function () {
			var node = $(this);
			var dataKey = 'chosen';
			if (!node.data(dataKey)) {
				if (this.tagName !== "SELECT") {
					throw new Error('Chosen can be applied to "select" elements only');
				}
				node.data(dataKey, new Chosen(this, options));
			}
		});
	}

	// -----------------------------------------------

	var utils = {

		log: function(type) {
			if (!window.console) return;
			if (!this.enabled) return;
			var method, args = arguments;
			if ($.inArray(arguments[0], ['log', 'info', 'warn', 'error', 'dir', 'group', 'groupEnd', 'profile', 'profileEnd']) < 0) {
				method = 'log';
			} else {
				method = arguments[0];
				args = $.makeArray(arguments).slice(1);
			}
			console[method].apply(console, args);
		},

		generateRandomChar: function () {
			var chars, index;
			chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
			index = Math.floor(Math.random() * chars.length);
			return chars.substr(index, 1);
		},

		generateRandomId: function () {
			var string;
			string = "chosen_" + this.generateRandomChar();
			while ($("#" + string).length > 0) {
				string += this.generateRandomChar();
			}
			return string;
		},

		/**
		 * Simple template engine
		 * Supports reading of object's nested.properties.including.0.numeric.1.keys.
		 *
		 * @param template String Template string. Placeholders must be wrapped to {curly_brackets}.
		 * @param dataObj Object|Array
		 * @param defaults Object|Array (optional)
		 */
		format: (function () {
			function parsePath(path, data, defaults) {
				var pathParts = path.split('.');
				var result = data;
				while (pathParts.length > 0 ) {
					result = result[pathParts.shift()];
					if (result === undefined) {
						if (defaults !== undefined) {
							result = parsePath(path, defaults);
						} else {
							result = '';
						}
						break;
					}
				}
				return result;
			}

			return function(template, dataObj, defaults) {
				if ( arguments.length === 1 ) {
					return function() {
						var args = $.makeArray(arguments);
						args.unshift(template);
						return utils.format.apply( this, args );
					};
				}
				template = template.replace(/\{((\w+[:-]?\w*\.?)+)\}/g, function(substr, match) {
					return parsePath(match, dataObj, defaults);
				});

				return template;
			}
		})(),

		/**
		 * Performs iteration through given dom nodes according to given config.
		 * By default iterates only through visible and not disabled nodes, other nodes will be ignored.
		 *
		 * @param config Object
		 *      forward - bool - whether to move from begin to end of list, or vice versa
		 *      onListEnd - string - what to do if currently selected item is last on specified direction:
		 *          'stop': do nothing, selection is not changed
		 *          'clear': clear selection, nothing will be selected
		 *          'rerun': select first item from opposite list end
		 *      items - array - items through which we will iterate
		 *      highlightedClass - string - name of css class, which will indicate selected item
		 *      filter - function - allows to set additional rules to exclude some items from given set
		 * @returns Object {
		 *      movedFrom - previously selected item
		 *      movedTo - currently selected item
		 *  }
		 */
		moveListSelection: function(config) {
			config.onListEnd || (config.onListEnd = 'stop');
			if ($.inArray(config.onListEnd, ['rerun', 'clear', 'stop']) < 0) {
				throw new Error(utils.format('Unknown option "{0}"', [config.onListEnd]));
			}
			var availableItemsSelector = ':visible:not(:disabled)'; // do not use just ':enabled', because by default 'disabled' property is undefined
			var currentItem, nextItem, availableItems;
			currentItem = config.items.filter('.' + config.highlightedClass);

			var filter = function(index, item) {
				item = $(item);
				return item.is(availableItemsSelector) && (config.filter ? item.is(config.filter) : true);
			};
			availableItems = config.items.filter(filter);
			if (currentItem.length) {
				nextItem = currentItem[config.forward ? 'nextAll' : 'prevAll']().filter(availableItems).first();
			} else {
				// if nothing is selected yet - then on forward movement always first item will be selected, and on backward - depending on 'onListEnd' option
				currentItem = availableItems.first();
				nextItem = config.forward ? currentItem : [];
			}

			if (!nextItem.length) {
				switch (config.onListEnd) {
					case 'stop':
						nextItem = availableItems[config.forward ? 'last' : 'first']();
						break;
					case 'rerun':
						nextItem = availableItems[config.forward ? 'first' : 'last']();
						break;
					case 'clear':
						currentItem.removeClass(config.highlightedClass);
						break;
					default:
				}
			}

			if (nextItem.length) {
				currentItem.removeClass(config.highlightedClass);
				nextItem.addClass(config.highlightedClass);
			}

			return {
				movedFrom: currentItem,
				movedTo: nextItem
			}
		},

		getAttribute: function(object, attributeName) {
			var value;
			if (typeof attributeName === 'function') {
				value = attributeName(object);
			} else {
				if (attributeName.slice(0, 5) === 'data-') {
					value = $.data(object, attributeName.slice(5));
				} else {
					value = object[attributeName];
				}
			}

			return value;
		},

		isOptionDisabled: function(option) {
			return option.disabled || (option.parentElement.tagName === 'OPTGROUP' && option.parentElement.disabled);
		},

		// several brutal hacks™ :

		getTextWidth: function(text) {
			var canvas = $('<span>').hide().text(text).appendTo(document.body);
			var width = canvas.width();
			canvas.remove();
			return width;
		},

		htmlHelper: (function () {
			var encoder = $('<div/>');
			return {
				encode: function(str) {
					return encoder.text(str).html();
				},
				decode: function(str) {
					return encoder.html(str).text();
				}
			}
		})()
	};

})(jQuery);
