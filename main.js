import './visual-search-t-blocked.less';
import template from './visual-search-t.html';

import $ from 'jquery';
import * as controls from 'wombat1-controls';

import shelf_classes from './shelf_classes.json';
import { ShelfRack, $newLayout } from 'shelf-rack';
import { TransitionHandler } from './transitions';

import { Timer } from 'wombat2-controls';

function onClick($element) {
    return new Promise(function (resolve) {
        $element.on('click', async (e) => {
            resolve(e);
        });
    });
}

async function showScreen($DOM, replacements) {
    $DOM.fadeIn(200);

    $DOM.find('.message').html(replacements.message);
    $DOM.find('.continue').val(replacements.continue_button);

    await onClick($DOM.find('.continue'));
    return await $DOM.fadeOut(200);
}

// //////////////////////////////////////////////////////////////
// MAIN SCRIPT LOOP                                            //
// //////////////////////////////////////////////////////////////
// args:
// 	[0]: $DOM			:	object (jQuery element)
//			the jQuery DOM element handle to the .main div
// 	[1]: configuration	:	object (parsed json)
// return:
// 		array
// desc:
// 		the main stimuli display and input recording loop, generates shelves on the fly from the config
// 		and records user input (which it returns as an array)
async function main($DOM, configuration, lang, pause, wrong_answer_screen, pause_replacements) {
    $DOM.find(`.stimuli`).css("height", $DOM.find(`.stimuli`).height() / 3);
    const rack_dimensions = {
        x: $DOM.find(`.content`).width() / 3,
        y: $DOM.find('.stimuli').height()
    };
    // const rack = new ShelfRack(configuration.layout, { shelves: shelf_classes.shelves, products: configuration.product_classes }, rack_dimensions);
    const racks = configuration.racks.map(rack_json => {
        // shelf rack code is easily the worst code I ever wrote there must be a punishment in the afterlife for this
        return new ShelfRack(rack_json.shelves.map(shelf_json => {
                return {
                    name: shelf_json.background
                };
            }),
            {
                shelves: shelf_classes.shelves,
                products: rack_json.shelves.reduce((product_arr, shelf_json) => {
                    return [...product_arr, ...shelf_json.products];
                }, [])
            },
            rack_dimensions
        );
    });
    console.log(`RACKS`);
    console.log(racks);
    const click_data = [];

    const specific_product = (transition_list) => {
        if (transition_list.enabled_count !== 0) {
            return true;
        } else {
            return false;
        }
    }

    window.onresize = async () => {
        rack.generateBoundedProducts();
    }

    const pause_experiment = async function (reset_timer, requested_product, transition_list) {
        reset_timer ? timer.complete() : timer.pause();
        $DOM.fadeOut(configuration.timer.reset_duration / 2);
        await showScreen(pause, pause_replacements);

        // delicious spaghetti
        await Promise.all(
            [
                reset_timer ? new Promise(res => timer.container_element.addEventListener(`wb2-timer`, (e) => {
                    if (e.detail.action === `reset-complete`) {
                        res();
                    }
                })) : async () => { },
                $DOM.fadeIn(configuration.timer.reset_duration).promise(),
                reset_timer ? (async () => {
                    if (configuration.repeat_behavior.triggers.timeout === true) {
                        if (configuration.repeat_behavior.rearrange === true) {
                            transition_list.stop();
                            $stimuli.empty();
                            await Promise.all(racks.map(rack => rack.generateBoundedProducts()));
                            $stimuli.append(await $newLayout($stimuli, rack, configuration.mouseover_classes, specific_product(transition_list)));
                            transition_list.setTarget($('img[data-product-type^="' + requested_product.split('-')[0] + '"]').eq(Math.floor(Math.random() * $('img[data-product-type^="' + requested_product.split('-')[0] + '"]').length)));
                            transition_list.start();
                            await new Promise(res => setTimeout(res, configuration.transition_behavior.duration / 2));

                        }
                    }
                })() : async () => { }
            ]);

        reset_timer ? timer.start() : timer.unpause();
    }

    // const timer = controls.timer($DOM.find('.timer'));
    // timer.duration(configuration.timer.duration);
    // timer.resetDuration(configuration.timer.reset_duration);
    const timer = new Timer($DOM.find(`.timer`)[0], configuration.timer.duration, configuration.timer.reset_duration);

    const pause_button = controls.pause($DOM.find('.pause-button'));
    pause_button.click(async () => {
        pause_experiment(false, undefined);
    });


    $DOM.show();
    const $stimuli = $DOM.find('.stimuli');
    const $instruction = $DOM.find('.shelf-instruction');

    const trial_count = controls.progress($DOM.find('.progress'));
    trial_count.setTotal(configuration.iterations);
    trial_count.update(0);


    $stimuli.append(`<div class="loading-stimuli">Loading images, please wait...</div>`);
    // MAIN LOOP
    for (let i = 0, repeat = 0, requested_product; i < configuration.iterations; repeat === 0 ? ++i : i) {

        await Promise.all(racks.map(rack => rack.generateBoundedProducts()));
        for (const rack of racks) {
            console.log(rack.items[0].item_groups);
            console.log(`from a pool:`);
            console.log(rack.product_classes);
            console.warn(`had ${rack.items[0].bounded_dimensions.x} width to work with`);
        }
        $stimuli.find(`.loading-stimuli`).hide();

        const layout_elems = await Promise.all(racks.map(rack => {
            return $newLayout($stimuli, rack, configuration.mouseover_classes);
        }));
        for (const layout_elem of layout_elems) {
            console.log(`APPEND`);
            console.log(layout_elem);
            $stimuli.append(layout_elem);
        }
        $stimuli.hide();

        if (repeat === 0 || configuration.repeat_behavior.new_target === true) {
            requested_product = $('.product').eq(Math.floor(Math.random() * $('.product').length)).attr('data-product-type');
            console.warn(`req:`);
            console.log(requested_product);
        }

        if (configuration.repeat_behavior.rearrange === true) {
            requested_product = $('img[data-product-type^="' + requested_product.split('-')[0] + '"]').eq(Math.floor(Math.random() * $('img[data-product-type^="' + requested_product.split('-')[0] + '"]').length)).attr('data-product-type');
        }

        const transition_handler = new TransitionHandler($DOM.find('.stimuli'), $('img[data-product-type="' + requested_product + '"]'), configuration.transition_behavior.css, configuration.transition_behavior.cycle_time, configuration.transition_behavior.duration, configuration.transition_behavior.cover_between);
        if (transition_handler.enabled_count == 0) {
            throw new Error("No transitions defined for flicker shelves");
        }

        // timer.timeout(async () => {
        // 	await pause_experiment(true, requested_product, transition_handler);
        // });
        timer.container_element.addEventListener(`wb2-timer`, async (e) => {
            if (e.detail.action === `complete`) {
                await pause_experiment(true, requested_product, transition_handler);
            }
        })

        const request_message = lang.request_text;
        transition_handler.start();

        $instruction.text(request_message);
        $stimuli.fadeIn(configuration.timer.reset_duration);
        $instruction.fadeIn(configuration.timer.reset_duration);
        timer.start();
        const click_info = {
            mouse_position: {
                x: NaN,
                y: NaN
            },
            product_type: {
                requested: (transition_handler.enabled_count !== 0) ? requested_product : requested_product.split('-')[0],
                clicked: null
            },
            time_taken: NaN
        };

        const event_info = await onClick($stimuli);
        const $correct_feedback_circle = $(`<div class="feedback-circle"></div>`);
        $correct_feedback_circle.css({
            left: event_info.pageX - 50,
            top: event_info.pageY - 50
        })

        transition_handler.stop();

        const $target = $(event_info.target);
        click_info.mouse_position.x = event_info.pageX;
        click_info.mouse_position.y = event_info.pageY;
        click_info.product_type.clicked = $target.attr('data-product-type');
        if (typeof click_info.product_type.clicked === 'undefined') {
            click_info.product_type.clicked = `none`;
        }
        click_info.product_type.clicked = (transition_handler.enabled_count !== 0) ? click_info.product_type.clicked : click_info.product_type.clicked.split('-')[0];
        click_info.correct = click_info.product_type.requested === click_info.product_type.clicked;

        if (!click_info.correct) {
            $correct_feedback_circle.addClass(`incorrect`);
        } else {
            trial_count.update(i + 1);
            $correct_feedback_circle.addClass(`correct`);
        }
        $(`#wombat`).append($correct_feedback_circle);
        timer.pause();
        click_info.time_taken = timer.value;
        const req = click_info.product_type.requested;
        const clicked = click_info.product_type.clicked;
        click_data.push(Object.assign(
            click_info,
            {
                trial_index: i
            },
            {
                product_type: {
                    requested: {
                        name: req.substring(0, req.lastIndexOf(`-`)),
                        index: req.substring(req.lastIndexOf(`-`) + 1, req.length)
                    },
                    clicked: {
                        name: clicked.substring(0, clicked.lastIndexOf(`-`)),
                        index: clicked.substring(clicked.lastIndexOf(`-`) + 1, clicked.length)
                    }
                }
            }
        ));

        if (click_data.length >= 3) {
            if (typeof click_data.slice(click_data.length - 3).find(v => v.correct === true) === `undefined`) {
                $correct_feedback_circle.remove();
                $DOM.fadeOut(200);
                await showScreen(wrong_answer_screen, { title: `Oops!`, message: `You've given ${3} wrong answers in a row.<br>Please make sure to click on the requested product.`, continue_button: `Got it!` });
                $DOM.fadeIn(200);
            }
        }

        // repeat triggers
        if (configuration.repeat_behavior.triggers.wrong_answer) {
            if (!click_info.correct) {
                ++repeat;
            } else {
                repeat = 0;

            }
        }
        if (configuration.repeat_behavior.continue_at > 0) {
            if (repeat % configuration.repeat_behavior.continue_at === 0) {
                repeat = 0;
                trial_count.update(i + 1);
            }
        }

        $instruction.empty();
        $stimuli.empty();
        // await timer.resetAsync();
        await new Promise(res => {
            timer.container_element.addEventListener(`wb2-timer`, (e) => {
                if (e.detail.action === `reset-complete`) {
                    console.log(`reset complete`);
                    res();
                }
            });
            timer.reset();
        })
        $correct_feedback_circle.remove();
    }

    return click_data;
}

// //////////////////////////////////////////////////////////////
// ENTRY POINT (DEFAULT EXPORTED FUNCTION)                     //
// //////////////////////////////////////////////////////////////
// args:
// [0]: configuration	:	object (parsed json)
//		the .json data passed into the component, see the examples
// [1]: callback		: 	function
// 		the function to execute on element completion, expects two parameters:
//		[0]: meta		:	object
//			 the meta data which will be written to the user's session objects (maintained between elements)
//		[1]: data		:	array
//			 the data produced by the user running through the element
export default async function (wombat_package) {
    // language
    const lang = Object.assign(wombat_package.language.constructed_language, wombat_package.instruction.language_options);
    const configuration = wombat_package.instruction;
    const screen = wombat_package.screen;

    $('head').append('<style>.product { transition: filter ' + configuration.transition_behavior.duration + 'ms linear; }</style>')

    const $DOM = $(template).clone();
    const $intro_screen = $DOM.find('.intro').hide();
    const $pause_screen = $DOM.find('.pause-screen-f').hide();
    const $wrong_answer_screen = $DOM.find('.wrong-answer-overload').hide();
    const $main = $DOM.find('.main').hide();

    const $title = $DOM.find('.title');
    $title.find('.header').text(lang.title.header);
    $title.find('.message').text(lang.title.message);

    $(screen).append($DOM);

    await showScreen($intro_screen, lang.screens.intro);

    const meta = {};
    const data = await main($main, configuration, lang, $pause_screen, $wrong_answer_screen, lang.screens.pause);

    return { META: meta, DATA: data };
}
