const async = require('async')
const { writeFileSync } = require('fs')
const readline = require('readline')
const stripFields = require('./../utils/strip-fields')

module.exports = setup

/**
 * Sets up widget configuration file
 *
 * @param  {[function]} api api client
 * @param  {[object]} config configuration file's data
 * @param  {[string]} region region to filter the configuration file
 * @param  {[object]} defaults default values used throughout the project
 */
function setup(api, config, region, defaults) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    let name
    let description

    async.series(
        [
            callback => {
                rl.question('App/Widget name: ', function(input) {
                    name = input
                    callback()
                })
            },
            callback => {
                rl.question('App/Widget description: ', function(input) {
                    description = input
                    callback()
                })
            }
        ],
        () => {
            Promise.resolve()
                .then(() => createApp(this.logger, api, name, description))
                .then(res =>
                    createWidget(this.logger, api, res, defaults.widget)
                )
                .then(res => createBucket(this.logger, api, res))
                .then(res => createBucketEntry(this.logger, api, res))
                .then(res => uploadWidget(this.logger, api, res, defaults))
                .then(res => {
                    config[region].app_json = res.app
                    config[region].widget_json = stripFields(res.widget)

                    writeFileSync(
                        'config.json',
                        JSON.stringify(config, null, 4)
                    )
                })
                .catch(err => {
                    this.logger.error(err)
                    process.exit(1)
                })
                .then(() => rl.close())
        }
    )
}

function createApp(logger, api, name, description) {
    const app = {
        name,
        description
    }

    return new Promise((resolve, reject) => {
        api('/api/apps', app)
            .then(res => {
                logger.info('Created app')
                logger.debug(res)
                resolve({ app: stripFields(res) })
            })
            .catch(err => reject(err))
    })
}

function createWidget(logger, api, settings, widgetDefaults) {
    const widget = Object.assign(
        {
            app_id: settings.app.id,
            description: settings.app.description,
            source: 'test',
            title: settings.app.name,
            type: 'marketplace'
        },
        widgetDefaults
    )

    return new Promise((resolve, reject) => {
        api('/api/apps/widgets', widget)
            .then(res => {
                logger.debug(res)
                logger.info('Created widget')
                resolve({
                    app: settings.app,
                    widget: stripFields(res)
                })
            })
            .catch(err => reject(err))
    })
}

function createBucket(logger, api, settings) {
    const bucket = {
        type: 'public'
    }

    return new Promise((resolve, reject) => {
        api(`/api/storage/buckets/${settings.widget.id}`, bucket, 'put')
            .then(res => {
                logger.info('Created bucket')
                logger.debug(res)
                resolve({
                    app: settings.app,
                    widget: settings.widget
                })
            })
            .catch(err => reject(err))
    })
}

function createBucketEntry(logger, api, settings) {
    const bucket = {
        type: 'public'
    }

    return new Promise((resolve, reject) => {
        api(`/api/storage/buckets/${settings.widget.id}/entry`, bucket, 'put')
            .then(res => {
                logger.info('Created bucket entry')
                logger.debug(res)
                resolve({
                    app: settings.app,
                    widget: settings.widget
                })
            })
            .catch(err => reject(err))
    })
}

function uploadWidget(logger, api, settings, defaults) {
    let widgetSettings = Object.assign({}, settings.widget)

    // widget id should not be passed into the payload
    // due to error key 'id' is invalid to update
    delete widgetSettings.id

    const widget = Object.assign(defaults.widget, widgetSettings, {
        type: 'marketplace',
        // the bucket was created with using the widget's id as name
        source: `/cmp/api/storage/buckets/${settings.widget.id}/${
            defaults.entry
        }`
    })

    return new Promise((resolve, reject) =>
        api(`/api/apps/widgets/${settings.widget.id}`, widget, 'put')
            .then(res => {
                logger.info('Uploaded widget')
                logger.debug(res)

                resolve({
                    app: settings.app,
                    widget: Object.assign(
                        {
                            id: settings.widget.id,
                            source: widget.source
                        },
                        stripFields(res)
                    )
                })
            })
            .catch(err => reject(err))
    )
}