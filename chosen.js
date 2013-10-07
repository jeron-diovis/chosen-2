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

				autocompleteMode: {
					enabled: false,
					openOnActivation: true // whether to show dropdown when container gets activated
				},

				multiMode: {
					choiceTemplate: '{text}',
					choiceContainerSelector: undefined, // allows to place choices in any element you wish
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

				/* Specify selectors for elements inside widget, click on which will not set focus to search field.
				 Can be useful, if you use own inputs inside widget */
				focusable: '',

				/* Specify selectors for elements, click on which will be always considered as inside widget, no matter where they really are.
				 So, click on such elements will not trigger a widget deactivation event.
				 Especially useful, if you show some pop-up windows when dropdown is opened, and want it not to be closed when user does clicks inside that popup */
				forceInside: '',

				/*
				 * Map for events to be prevented from their default handling.
				 * Keys must be any valid JQuery selectors.
				 * Values must be a strings - event names (single event, or list, separated by comma).
				 *
				 * Also values can be an arrays, as it is showed below: first element describes event names, and other elements are key codes whose events must be prevented.
				 * This syntax is done specially for keydown/keyup/keypress events. If none of key codes specified, than event always will be prevented.
				 *
				 * Default value below is mostly done to prevent widget's parent form from submitting.
				 *
				 * Note: this settings does not affect on widgets default components like search field or dropdown header anchor.
				 * They have their own events handling and we do not want you to break it.
				 *
				 * TODO: add support for configuring ctrl/shift/alt buttons handling
				 */
				preventDefaults: {
					':input': ['keydown', 13]
				},

				search: {
					tagName: 'ul',
					itemTemplate: '{text}',
					groupTemplate: '<i>{label}</i>',
					placeholder: 'Search for something',
					noResultsMessage: 'No results match "{keyword}"',
					showNoResultsMessage: true,
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

		if (this.isHiddenOptionRequired()) {
			this.$el.prepend($('<option>', {
				'class': 'chzn-system-hidden-option',
				'selected': false,
				'text': this.options.ui.autocompleteMode.enabled ? '' : this.options.ui.placeholder,
				'value': '' // not null! if null, value will be set to text;
			}));
		}

		// -------------------

		this.backup(this.el.options);

		// -------------------

		this.log('Creating ui...');
		this.ui = new ChosenUI(this, this.options.ui);

		// -------------------

		this.log('Initializing...');

		this.options.beforeInit.call(this);

		// TODO: get rid of this
		// re-run filtering, to decide whether selected or deselected item should be displayed according to current options
		this.bind('chzn:option-selected.sys chzn:option-deselected.sys', $.proxy(function() { this.trigger('chzn:search-list:filter'); }, this));

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
			this.log('Unbind: ', arguments);
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
			var maxSelected = this.options.multiMode.maxSelected;
			if (this.el.multiple) {
				var selectedOptions = $(this.el.options).filter(':selected');
				if (selectedOptions.length > maxSelected) {
					selectedOptions.slice(maxSelected - selectedOptions.length).prop('selected', false);
				}
				this.options.multiMode.maxSelected = Infinity;
			}

			// TODO: need optimization, some 'batch select'. Too much events on start
			$.each(this.getActiveOptions(), $.proxy(function(index, option) {
				if (option.selected) {
					this.selectItem(option.index);
				}
			}, this));

			this.options.multiMode.maxSelected = maxSelected;
			this.trigger('chzn:search-list:clear-highlight.sys');

			if (this.options.ui.groups.allowCollapse && this.options.ui.groups.collapseOnInit) {
				var optgroups = this.$el.find('optgroup');
				var indexes = $.map(optgroups, $.proxy($.fn.index, optgroups));
				if (indexes.length) {
					this.trigger('chzn:search-list:toggle-group', [indexes, true]);
				}
			}

			if (this.options.ui.openAfterInit) {
				this.trigger('chzn:dropdown:open');
			}

			return this;
		},

		reset: function(options) {
			options || (options = {});

			this.resetNewItems();

			var optionNodes = $(this.el.options);
			for (var propName in this.initialState) if (this.initialState.hasOwnProperty(propName)) {
				optionNodes.prop(propName, (function (propValues) {
					return function (index) { return propValues[index]; }
				})(this.initialState[propName]));
			}

			if (options.hard) {
				optionNodes.prop({
					selected: false,
					disabled: false
				});
			}

			this.ui.searchField && this.ui.searchField.val('');
			this.ui.choiceList && this.ui.choiceList.children(this.ui.getChoiceSelector()).remove();
			this.trigger('chzn:search-list:compose-items');
			this.init();

			if (!options.silent) {
				this.trigger('chzn:reseted', [options]);
			}

			return this;
		},

		isSelectionLimitReached: function() {
			return this.el.multiple && $(this.el.options).filter(':selected').length >= this.options.multiMode.maxSelected;
		},

		isHiddenOptionRequired: function() {
			return !this.el.multiple && (this.options.singleMode.allowDeselect || this.options.ui.autocompleteMode.enabled);
		},

		getActiveOptions: function() {
			var options = $(this.el.options);
			if (this.isHiddenOptionRequired()) {
				options = options.slice(1);
			}
			return options;
		},

		isNewOption: function(optionConfig) {
			return (optionConfig.text !== undefined) && !this.getActiveOptions().is(utils.textCompare(optionConfig.text));
		},

		selectItem: function(index) {
			if (this.isSelectionLimitReached()) {
				this.trigger('chzn:max-selected');
				return false;
			}

			var option = this.el.options[index];
			option.selected = true;
			this.trigger('chzn:option-selected', [option, this.getActiveOptions().filter(':selected')]);
			this.trigger('chzn:change', [option, this.getActiveOptions().filter(':selected')]);

			return this;
		},

		deselectItem: function(index) {
			var option = this.el.options[index];
			option.selected = false;
			this.trigger('chzn:option-deselected', [option, this.getActiveOptions().filter(':selected')]);
			this.trigger('chzn:change', [option, this.getActiveOptions().filter(':selected')]);

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
			if (!this.isNewOption(config)) {
				throw new Error(utils.format('Option creation is denied. Perhaps, options with label "{0}" already exists', [config.text]));
			}

			config.value || (config.value = config.text); // just to explicit set tag attribute; internally, browser already sets value for you

			var newOption = $('<option>', config);
			var optionNode = newOption.get(0);

			if (options.save) {
				this.backup([optionNode], true);
			} else {
				newOption.addClass('new');
			}

			this.$el.append(newOption);
			var newItem = this.ui.createSearchItem(optionNode);
			var lastItem = this.ui.searchList.find(this.ui.getSearchItemSelector()).last();
			if (lastItem.length > 0) {
				newItem.insertAfter(lastItem);
			} else {
				newItem.prependTo(this.ui.searchList);
			}

			this.trigger('chzn:option-created', [optionNode]);

			if (optionNode.selected || this.options.ui.createItems.selectCreated) {
				this.selectItem(optionNode.index);
			}

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

			for (var propName in this.initialState) if (this.initialState.hasOwnProperty(propName)) {
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
								for (var attributeName in searchOptions.ajax.mapping) if (searchOptions.ajax.mapping.hasOwnProperty(attributeName)) {
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
				return $.map(this.getActiveOptions(), function(option) {
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

					return isMatch ? option.index : null;
				});
			}
		})(),

		/**
		 * Serializes selected items, allowing to customize serializable attributes
		 * Result format depends on {@link boolean wwwFormUrlEncoded} param.
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
		var isAutocomplete = this.options.autocompleteMode.enabled;

		if (!isAutocomplete) {
			this.dropdownHeader = this.createSingleSelectedItem();
			this.dropdownHeader.prependTo(this.container);
			choiceListContainer = this.container;
			if (isSearchEnabled) searchFieldWrapper = $('<div>', { 'class': 'chzn-search' }).prependTo(this.dropdown);
		} else {
			choiceListContainer = $('<div>', { 'class': 'chzn-autocomplete' });
			searchFieldWrapper = $(this.isChoicesOutside() ? '<div>' : this.getUiItemTag(), { 'class': 'search-field' });
			if (!isSearchEnabled) {
				this.dropdownHeader = $('<a>', {
					'class': 'autocomplete-placeholder',
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

		if (isAutocomplete) {
			if (isSearchEnabled) {
				this.dropdownHeader = this.searchField;
			}
			if (this.el.multiple && !this.isChoicesOutside()) {
				this.choiceList.append(searchFieldWrapper);
			}
		}

		this.container.append(this.dropdown).insertAfter(this.$el);
		this.preventDefaults(this.container, this.options.preventDefaults);

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
			var items = container.find(itemSelector);
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
			if (optgroup.is('optgroup')) { // real 'optgroup' tag
				indexes = $.map(optgroup.children('option'), function(option) { return option.index; })
			} else { // optgroup imitation from search list
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

		isChoicesOutside: function() {
			return this.options.multiMode.choiceContainerSelector !== undefined;
		},

		/**
		 * Prevents default event handling inside given container node basing on given configuration
		 * See 'ui.preventDefaults' option for details.
		 *
		 * @param container
		 * @param config
		 * @returns {*}
		 */
		preventDefaults: function(container, config) {
			var chosenUI = this;

			var createEventPreventor = function(condition) {
				return function(e) {
					var elem = $(e.target);
					var isDefaultElement = elem.is(chosenUI.keydownTarget) || elem.is(chosenUI.dropdownHeader) || elem.is(chosenUI.searchField);
					if (!isDefaultElement && condition(e)) {
						e.preventDefault();
					}
				}
			};
			var condition;

			for (var selector in config) if (config.hasOwnProperty(selector)) {
				var event = this.options.preventDefaults[selector];
				var keyCodes = [];

				if (event.constructor === Array) {
					keyCodes = event.splice(1);
					event = event[0];
				}

				if (keyCodes.length > 0) {
					condition = (function (keyCodes) {
						return function(e) { return $.inArray(e.keyCode, keyCodes) >= 0; }
					})(keyCodes);
				} else {
					condition = function() { return true; }
				}

				container.on(event, selector, createEventPreventor(condition));
			}

			return this;
		},

		// create base widget nodes :

		createContainer: function() {
			var activeContainerClass = 'chzn-container-active';

			var classes = [
				'chzn-container'
			];
			if (this.options.autocompleteMode.enabled) {
				classes.push('autocomplete');
			}
			if (this.el.multiple) {
				classes.push('chzn-container-multi');
			} else {
				classes.push('chzn-container-single');
			}
			if (this.options.inheritCssClasses) {
				classes.push(this.el.className);
			}

			var chosenUI = this;

			function isInsideContainer(event, isActivating) {
				if ($(event.target).closest(chosenUI.options.forceInside).length > 0) return true;

				// deny to activate container on _direct_ click on choice list - because, in common case, choice list is independent node, not inside container
				if (!chosenUI.options.autocompleteMode.enabled && chosenUI.el.multiple && event.target === chosenUI.choiceList.get(0)) return false;

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
				if (!isActivating) { // TODO: deprecated; remove
					isInside = isInside || (chosenUI.el.multiple && parents.is('.search-choice-close'));
					if (chosenUI.el.multiple && chosenUI.options.autocompleteMode.enabled) {
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
				.on('click.chzn:container:watch-focus', '', function(e) {
					var eventName = 'chzn:container:activate';
					if ($(e.currentTarget).closest(chosenUI.options.focusable).length > 0) {
						eventName += '.highlight';
					}
					chosenUI.trigger(eventName);

					if (chosenUI.options.autocompleteMode.enabled && chosenUI.options.autocompleteMode.openOnActivation) {
						chosenUI.trigger('chzn:dropdown:open');
					}
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
					}, 4);
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

			var toggleDropdown = function(state) {
				if (!chosenUI.options.autocompleteMode.enabled) {
					chosenUI.dropdownHeader.toggleClass(classes.selectedItem, state);
				}
				dropdown[state ? 'show' : 'hide']();
			};

			var dropdownMethods = {
				'open': function() {
					if (chosenUI.options.multiMode.blockDropdownOnLimitReached && chosenUI.chosen.isSelectionLimitReached()) {
						chosenUI.trigger('chzn:max-selected.dropdown-open');
						return;
					}
					toggleDropdown(true);
				},

				'close': function() {
					// TODO: behavior subscription
					if (chosenUI.options.resetAfterClose) {
						chosenUI.searchField && chosenUI.searchField.val('');
						chosenUI.trigger('chzn:search-list:reset-filter');
					}
					chosenUI.itemCreator && chosenUI.itemCreator.removeClass('highlighted'); // TODO: css dependency

					toggleDropdown(false);
				},

				'toggle': function(state) {
					var action = (typeof state === "boolean" ? state : dropdown.is(':hidden')) ? 'open' : 'close';
					dropdownMethods[action]();
				}
			};

			chosenUI.bind({
				'chzn:dropdown:open': dropdownMethods.open,
				'chzn:dropdown:close': dropdownMethods.close,
				'chzn:dropdown:toggle': function(e, state) {
					dropdownMethods.toggle(state);
				}
			});

			if (chosenUI.options.closeAfterChange) {
				chosenUI.bind({
					'chzn:option-selected.dropdown': function() {
						setTimeout(function() { chosenUI.trigger('chzn:dropdown:close'); }, 1);
					}
				});
			}

			return dropdown;
		},

		createSearchField: function() {
			var defaultCssClassName = 'default';

			var searchField = $('<input>', {
				'type': 'text',
				'placeholder': this.options.search.placeholder,
				'class': defaultCssClassName
			});

			searchField.prop('autocomplete', 'off');

			var chosenUI = this;
			var handler, prevValue = '', isFiltered = false;
			var isAutocomplete = !chosenUI.el.multiple && chosenUI.options.autocompleteMode.enabled;

			var toggleCssClass = function() {
				searchField.toggleClass(defaultCssClassName, searchField.val().length === 0);
			};

			var onChangeHandler = function(e, setValue) {
				if (setValue !== undefined) {
					this.value = setValue;
				}

				var keyword = this.value;

				// emulate 'onChange' without loosing focus
				if (keyword != prevValue) {
					toggleCssClass();

					if (keyword.length < chosenUI.chosen.options.search.minLength) {
						if (isFiltered) {
							chosenUI.trigger('chzn:search-list:reset-filter', true);
							isFiltered = false;
						}
					} else {
						clearTimeout(handler);
						handler = setTimeout(
							$.proxy(chosenUI.trigger, chosenUI, 'chzn:search-list:filter', keyword),
							chosenUI.chosen.options.search.delay
						);
						isFiltered = true;
					}

					if (isAutocomplete) {
						var createChangeStateIterator = function(changeStateMethod) {
							return function(arrayIndex, option) {
								chosenUI.chosen[changeStateMethod](option.index);
							}
						};
						var customOption = $(chosenUI.el.options[0]);

						var allOptions = chosenUI.chosen.getActiveOptions();
						var matchingOptions = allOptions.filter(utils.textCompare(keyword));

						allOptions.not(matchingOptions).filter(':selected').each(createChangeStateIterator('deselectItem'));
						if (matchingOptions.length > 0) {
							matchingOptions.not(':selected').each(createChangeStateIterator('selectItem'));
						} else {
							customOption.prop({
								value: keyword,
								text: keyword
							});
						}
					}
				}
				prevValue = keyword;
			};

			searchField.on('change.chzn', onChangeHandler);
			searchField.keyup(onChangeHandler);

			if (isAutocomplete) {
				chosenUI.bind('chzn:option-selected.search-field', function(e, option) {
					searchField.val(option.text);
					prevValue = option.text;
					toggleCssClass();
				});
			}

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
				return list.find(resultSelector);
			}

			function getSearchItemGroups() {
				return list.find(groupSelector);
			}

			//------------------------------------

			var getSelectionEventName = 'chzn:list:on-get-selection';
			var looseSelectionEventName = 'chzn:list:on-loose-selection';

			list
				.on('click.chzn:search:select-item', resultSelector + '.' + classes.highlighted,
					$.proxy(function(e) { this.chosen.selectItem($(e.currentTarget).data('option-index')); }, this)
				)
				.on($.extend(
					{
						'mouseenter.chzn:search:highlight': function() {
							$(this).trigger(getSelectionEventName).siblings().trigger(looseSelectionEventName);
						},
						'mouseleave.chzn:search:unhighlight': function() {
							$(this).trigger(looseSelectionEventName);
						}
					},
					(function () {
						var config = {};
						config[getSelectionEventName] = function() {
							$(this).addClass(classes.highlighted);
						};
						config[looseSelectionEventName] = function() {
							$(this).removeClass(classes.highlighted);
						};
						return config;
					})()),
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

			var composeListItems = $.proxy(function(indexes) {
				indexes || (indexes = []);

				var chosenUI = this;
				var optionsList = chosenUI.chosen.getActiveOptions();
				if (indexes.length) {
					optionsList = optionsList.filter(function() { return $.inArray(this.index, indexes) >=0; });
				}
				if (chosenUI.options.search.excludeDisabled) {
					optionsList = optionsList.filter(function() { return !utils.isOptionDisabled(this); });
				}

				list.find(chosenUI.getSearchItemSelector()).remove();
				var searchItems = optionsList.map(function() { return chosenUI.createSearchItem(this).get(0); });

				/* Protect from modifying search list content by another plugins
				 For example, some plugin for custom scroll can add own block inside list - so items must be inserted to that block, not directly to list */
				var serviceItem = list.find(noResultsMessage).get(0) || list.find(chosenUI.itemCreator).get(0);
				if (serviceItem) {
					searchItems.insertBefore(serviceItem)
				} else {
					searchItems.prependTo(list);
				}

				list.find(chosenUI.getSearchItemGroupSelector()).remove();
				var optgroups = $.map(chosenUI.$el.children('optgroup'), $.proxy(chosenUI.createSearchItemsGroup, chosenUI));
				$.each(optgroups, function() {
					var optgroup = $(this);
					var children = searchItems.filter(function() { return $.inArray($(this).data('option-index'), optgroup.data('children-indexes')) >= 0; });
					if (chosenUI.options.search.excludeDisabled) {
						children = children.not(':disabled');
					}
					optgroup.insertBefore(children.first());
				});
			}, this);

			//------------------------------------

			var toggleItemSelection = $.proxy(function(index, isSelected) {
				var chosenUI = this;

				var items = getSearchItems();
				var selectedItem = chosenUI.getSearchItemByOptionIndex(index);
				selectedItem.toggleClass(classes.selected, isSelected);
				if (chosenUI.el.multiple) {
					if (isSelected) {
						chosenUI.trigger('chzn:search-list:move-selection', [true, 'rerun']);
					}
				}
				if (isSelected && !chosenUI.el.multiple) { items.not(selectedItem).removeClass(classes.selected); }

				var group = chosenUI.getSearchItemGroupByOptionIndex(index);
				var groupOptions = chosenUI.getOptionForSearchItem(chosenUI.getSearchItemsFromGroup(group));
				var isAllSelected = groupOptions.length === $(groupOptions).filter('option:selected').length;
				group.toggleClass(classes.groupCompleted, isAllSelected);
			}, this);

			this.bind('chzn:option-selected.search-list chzn:option-deselected.search-list', function(e, option) {
				toggleItemSelection(option.index, option.selected);
			});

			//------------------------------------

			this.bind({
				'chzn:search-list:compose-items': function(e, indexes) { composeListItems(indexes); },

				'chzn:search-list:set-selected': function(e, index, isSelected) { toggleItemSelection(index, isSelected); },

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
							$(this).trigger('mouseenter');
						});
					}
				},

				'chzn:search-list:highlight': function(e, index, useDataIndex) {
					var items = list.children(selectableResultsSelector);
					var highlightedItem = !useDataIndex ? items.eq(index) : this.ui.getSearchItemByOptionIndex(index);
					if (!highlightedItem.length) {
						if (useDataIndex && index === 0 && this.isHiddenOptionRequired()) {
							return;
						}
						throw new ReferenceError(utils.format('Item with index "{0}" does not exist', [index]));
					}
					if (highlightedItem.prop('disabled')) {
						return;
					}
					items.not(highlightedItem).trigger(looseSelectionEventName);
					highlightedItem.trigger(getSelectionEventName);
				},

				'chzn:search-list:clear-highlight': function() {
					getSearchItems().add(this.ui.itemCreator).add(getSearchItemGroups()).removeClass(classes.highlighted);
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
					this.ui.searchList.find(this.ui.getSearchItemGroupSelector()).removeClass(classes.groupCompleted);
					noResultsMessage.hide().empty();
					this.ui.itemCreator && this.trigger('chzn:item-creator:clear');
				},

				'chzn:search-list:filter': function(e, keyword) {
					var chosen = this;

					if (keyword === undefined) {
						keyword = chosen.options.search.enabled ? chosen.ui.searchField.val() : '';
					}

					if (!keyword.length) {
						chosen.trigger('chzn:search-list:reset-filter', [true]);
						return;
					}

					var indexes = this.search(keyword);
					if (chosen.options.ui.search.ignoreSelected) {
						indexes = $(indexes).not(chosen.$el.find('option:selected').map(function() { return this.index; })).toArray();
					}
					var matchingItems = this.ui.getSearchItemByOptionIndex(indexes);

					var searchItems = getSearchItems();

					matchingItems.removeClass(classes.noMatch);
					searchItems.not(matchingItems).addClass(classes.noMatch);

					var optgroups = chosen.ui.searchList.find(this.ui.getSearchItemGroupSelector());
					var matchingGroups = optgroups.filter(
						chosen.ui.getSearchItemGroupByOptionIndex(
							$.map(
								matchingItems.filter(utils.format(':not(.{0}, .{1})',[classes.selected, classes.noMatch])),
								function(item) { return $(item).data('option-index'); }
							)
						)
					);
					matchingGroups.removeClass(classes.groupCompleted);
					optgroups.not(matchingGroups).addClass(classes.groupCompleted);

					if (chosen.options.createItems.enabled) {
						var isExactMatch = this.getActiveOptions().is(utils.textCompare(keyword));
						if (!isExactMatch) {
							this.trigger('chzn:item-creator:render', [keyword]);
						} else {
							this.trigger('chzn:item-creator:clear');
						}
					}

					var isCreatorVisible = chosen.options.createItems.enabled && chosen.options.ui.search.isCreatorMatches && !isExactMatch;
					if (matchingItems.length == 0 &&  chosen.options.ui.search.showNoResultsMessage && !isCreatorVisible) {
						noResultsMessage.html(utils.format(chosen.options.ui.search.noResultsMessage, { keyword: utils.htmlHelper.encode(keyword) })).show();
					} else {
						noResultsMessage.hide().empty();
					}

					chosen.trigger('chzn:search-list:filtered', [keyword, matchingItems.length]);
					searchItems.filter('.' + classes.highlighted).not(':visible').add(chosen.ui.itemCreator).removeClass(classes.highlighted);
					if (chosen.options.ui.search.forceHighlight && !searchItems.filter('.' + classes.highlighted).length && matchingItems.length) {
						chosen.trigger('chzn:search-list:move-selection', [true]);
					}
				}
			});

			composeListItems();

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

			var deselectHandler = $.proxy(this.chosen.selectItem, this.chosen, 0);
			if (isSingleDeselectAllowed) {
				singleDeselectBtn = $('<span>', { 'class': 'single-deselect' })
					.hide()
					.insertBefore(selectedItem.children().last());

				singleDeselectBtn.click(deselectHandler);
			}

			if (!this.el.multiple) {
				this.bind({
					'chzn:option-selected.single-select': function(event, option) {
						selectedItem.children('.dropdown-text:first').text(option.text);
						var isEmptyOption = !option.value && option.index === 0;
						selectedItem.toggleClass('chzn-default', isEmptyOption && isSingleDeselectAllowed);
						if (isSingleDeselectAllowed) {
							singleDeselectBtn[isEmptyOption ? 'hide' : 'show']();
						}
					},

					// in native dropdown, when no options selected, first option sets selected automatically; we do the same
					'chzn:option-deselected.single-select': deselectHandler
				});
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
					text: keyword
				});
			};

			itemCreator.bind('activate', activator);
			itemCreator.click(activator);

			this.bind({
				'chzn:item-creator:render': function(e, newItemText) {
					chosen.ui.itemCreator
						.html(utils.format(
							chosen.ui.options.createItems.message,
							{ keyword: utils.htmlHelper.encode(newItemText) }
						))
						.show();
				},
				'chzn:item-creator:clear': function() {
					chosen.ui.itemCreator.hide().empty();
				}
			});

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
						var isChoice = self.closest(choiceSelector).length > 0;
						if (!isChoice) {
							list.children(choiceSelector).removeClass(classes.choiceSelected);
							$(document).off(blurEventName);
						}
					});
				}, 10);
			}

			list.on('keydown', deselectBtnSelector, function(e) {
				switch (e.keyCode) {
					case 8: // backspace
						e.preventDefault();
						chosenUI.trigger('chzn:choice-list:deselect-highlighted');
						chosenUI.trigger('chzn:container:activate');
						break;
					case 27: // escape
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
				if (chosenUI.el.multiple && chosenUI.options.autocompleteMode.enabled && !chosenUI.isChoicesOutside()) {
					chosenUI.trigger('chzn:container:activate.highlight');
					if (!choices.filter(selectedChoiceSelector).length) {
						chosenUI.keydownTarget.focus();
					}
				}
				bindChoiceBlurWatcher();
			});

			this.bind({
				'chzn:option-selected.choice-list': function(e, option) {
					var newChoice = this.ui.createChoice(option);
					if (!this.options.ui.autocompleteMode.enabled || this.ui.isChoicesOutside()) {
						this.ui.choiceList.append(newChoice);
					} else {
						this.ui.dropdownHeader.parent().before(newChoice);
					}
				},
				'chzn:option-deselected.choice-list chzn:option-removed.choice-list': function (e, option) {
					chosenUI.getChoiceByOptionIndex(option.index).remove();
				}
			});

			this.bind({
				'chzn:choice-list:deselect-highlighted': function() {
					list.children(selectedChoiceSelector).each(function() {
						chosenUI.chosen.deselectItem($(this).data('option-index'));
					});
				},

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
			if (this.options.autocompleteMode.enabled) {
				var text = this.searchField ? this.options.search.placeholder : this.options.placeholder;
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
								} else if (chosenUI.options.autocompleteMode.enabled) {
									chosenUI.trigger('chzn:container:deactivate');
								}
							}
						}
						break;
					default:
					// no action
				}
			});

			if (!chosenUI.options.autocompleteMode.enabled && chosenUI.chosen.options.search.enabled) {
				chosenUI.dropdownHeader.keydown(function(e) {
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
	};

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
						// no action
						break;
					default:
					// no action
				}
			}

			currentItem.removeClass(config.highlightedClass);
			currentItem.trigger('chzn:list:on-loose-selection');

			if (nextItem.length) {
				nextItem.addClass(config.highlightedClass);
				nextItem.trigger('chzn:list:on-get-selection');
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

		makeJqueryIterator: function(func, prop, context) {
			var composeValue = function(originValue) {
				var value;
				if (prop !== undefined) {
					if (typeof prop === 'function') {
						value = prop.call(originValue);
					} else if ($.isArray(prop)) {
						value = prop[0].apply(originValue, prop.slice(1));
					} else {
						value = originValue[prop];
					}
				}
				return value;
			};

			return function() {
				var index = arguments[0];
				var value = arguments[1];
				return func.apply(context || this, [composeValue(value), index]);
			}
		},

		textCompare: function(pattern, source) {
			var comparator = function(source) {
				return pattern.toLowerCase() === source.toLowerCase();
			};

			if (source === undefined) {
				return utils.makeJqueryIterator(comparator, 'text');
			} else {
				return comparator(source);
			}
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