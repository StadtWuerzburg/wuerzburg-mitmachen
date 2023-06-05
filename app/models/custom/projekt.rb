class Projekt < ApplicationRecord
  OVERVIEW_PAGE_NAME = "projekt_overview_page".freeze

  include Milestoneable
  acts_as_paranoid column: :hidden_at
  include ActsAsParanoidAliases
  include Mappable
  include ActiveModel::Dirty
  include SDG::Relatable
  include Taggable
  include Imageable

  translates :description
  include Globalizable

  has_many :children, -> { order(order_number: :asc) }, class_name: "Projekt", foreign_key: "parent_id",
    inverse_of: :parent
  belongs_to :parent, class_name: "Projekt", optional: true

  has_many :debates, dependent: :nullify
  has_many :proposals, dependent: :nullify
  has_many :polls, dependent: :nullify
  has_many :legislation_processes, dependent: :nullify, class_name: "Legislation::Process"
  has_many :projekt_events, dependent: :destroy
  has_many :questions, -> { order(:id) },
    class_name: "ProjektQuestion",
    inverse_of:  :projekt,
    dependent:   :destroy

  has_one :page, class_name: "SiteCustomization::Page", dependent: :destroy

  has_many :projekt_phases, dependent: :destroy
  has_many :debate_phases, class_name: "ProjektPhase::DebatePhase", dependent: :destroy
  has_many :proposal_phases, class_name: "ProjektPhase::ProposalPhase", dependent: :destroy
  has_many :budget_phases, class_name: "ProjektPhase::BudgetPhase", dependent: :destroy
  has_many :comment_phases, class_name: "ProjektPhase::CommentPhase", dependent: :destroy
  has_many :voting_phases, class_name: "ProjektPhase::VotingPhase", dependent: :destroy
  has_many :milestone_phases, class_name: "ProjektPhase::MilestonePhase", dependent: :destroy
  has_many :projekt_notification_phases, class_name: "ProjektPhase::ProjektNotificationPhase",
    dependent: :destroy
  has_many :newsfeed_phases, class_name: "ProjektPhase::NewsfeedPhase", dependent: :destroy
  has_many :event_phases, class_name: "ProjektPhase::EventPhase", dependent: :destroy
  has_many :legislation_phases, class_name: "ProjektPhase::LegislationPhase", dependent: :destroy
  has_many :question_phases, class_name: "ProjektPhase::QuestionPhase", dependent: :destroy
  has_many :argument_phases, class_name: "ProjektPhase::ArgumentPhase", dependent: :destroy
  has_many :livestream_phases, class_name: "ProjektPhase::LivestreamPhase", dependent: :destroy
  # has_many :geozone_restrictions, through: :projekt_phases

  has_many :budgets, through: :budget_phases

  has_and_belongs_to_many :geozone_affiliations, class_name: "Geozone",
    after_add: :touch_updated_at, after_remove: :touch_updated_at
  has_and_belongs_to_many :individual_group_values,
    after_add: :touch_updated_at, after_remove: :touch_updated_at

  has_many :projekt_settings, dependent: :destroy
  has_many :projekt_notifications, dependent: :destroy
  has_many :projekt_arguments, through: :argument_phases
  has_many :projekt_livestreams, dependent: :destroy

  has_many :comments, as: :commentable, inverse_of: :commentable, dependent: :destroy
  belongs_to :author, -> { with_hidden }, class_name: "User", inverse_of: :projekts

  has_many :map_layers, dependent: :destroy

  has_many :projekt_labels, dependent: :destroy

  has_many :projekt_manager_assignments, dependent: :destroy
  has_many :projekt_managers, through: :projekt_manager_assignments

  accepts_nested_attributes_for(
    :projekt_events, :projekt_notifications
  )

  before_validation :set_default_color
  after_create :create_corresponding_page, :set_order, :ensure_projekt_phases, :create_default_settings,
    :create_map_location
  around_update :update_page
  after_save do
    Projekt.all.find_each { |projekt| projekt.update_column("level", projekt.calculate_level) }
  end
  after_destroy :ensure_projekt_order_integrity

  validates :color, format: { with: /\A#[\da-f]{6}\z/i }
  validates :name, presence: true

  scope :regular, -> { where(special: false) }

  scope :with_order_number, -> { where.not(order_number: nil).order(order_number: :asc) }

  scope :top_level, -> {
    regular
      .with_order_number
      .where(parent: nil)
  }

  scope :activated, -> {
    joins("INNER JOIN projekt_settings act ON projekts.id = act.projekt_id")
      .where("act.key": "projekt_feature.main.activate", "act.value": "active")
  }

  scope :current, ->(timestamp = Time.zone.today) {
    activated
      .where("total_duration_start IS NULL OR total_duration_start <= ?", timestamp)
      .where("total_duration_end IS NULL OR total_duration_end >= ?", timestamp)
  }

  scope :expired, ->(timestamp = Time.zone.today) {
    activated
      .where("total_duration_end < ?", timestamp)
  }

  scope :index_order_all, ->() {
    with_published_custom_page
      .show_in_overview_page
  }

  scope :index_order_underway, ->() {
    current
      .with_published_custom_page
      .show_in_overview_page
      .not_in_individual_list
      .includes(:projekt_phases)
      .select { |p| p.projekt_phases.regular_phases.any?(&:current?) }
  }

  scope :index_order_ongoing, ->() {
    current
      .with_published_custom_page
      .show_in_overview_page
      .not_in_individual_list
      .includes(:projekt_phases)
      .select { |p| p.projekt_phases.regular_phases.all? { |phase| !phase.current? } }
  }

  scope :index_order_upcoming, ->(timestamp = Time.zone.today) {
    activated
      .with_published_custom_page
      .show_in_overview_page
      .not_in_individual_list
      .where("total_duration_start > ?", timestamp)
  }

  scope :index_order_expired, ->(timestamp = Time.zone.today) {
    expired
      .with_published_custom_page
      .show_in_overview_page
      .not_in_individual_list
  }

  scope :index_order_individual_list, -> {
    with_published_custom_page
      .show_in_overview_page
      .joins("INNER JOIN projekt_settings siil ON projekts.id = siil.projekt_id")
      .where("siil.key": "projekt_feature.general.show_in_individual_list", "siil.value": "active")
  }

  scope :not_in_individual_list, -> {
    joins("INNER JOIN projekt_settings siil ON projekts.id = siil.projekt_id")
      .where("siil.key": "projekt_feature.general.show_in_individual_list", "siil.value": [nil, ""])
  }

  scope :show_in_overview_page, -> {
    joins("INNER JOIN projekt_settings siop ON projekts.id = siop.projekt_id")
      .where("siop.key": "projekt_feature.general.show_in_overview_page", "siop.value": "active")
  }

  scope :visible_in_menu, ->(user = nil) {
    joins("INNER JOIN projekt_settings vim ON projekts.id = vim.projekt_id")
      .where("vim.key": "projekt_feature.general.show_in_navigation", "vim.value": "active")
      .with_order_number
      .select { |p| p.visible_for?(user) }
  }

  scope :show_in_sidebar, ->(resources_name) {
    joins("INNER JOIN projekt_settings sis ON projekts.id = sis.projekt_id")
      .where("sis.key": "projekt_feature.#{resources_name}.show_in_sidebar_filter", "sis.value": "active") }

  scope :with_active_feature, ->(projekt_feature_key) {
    joins("INNER JOIN projekt_settings waf ON projekts.id = waf.projekt_id")
      .where("waf.key": "projekt_feature.#{projekt_feature_key}", "waf.value": "active") }

  scope :by_my_posts, ->(my_posts_switch, current_user_id) {
    return unless my_posts_switch

    where(author_id: current_user_id)
  }

  scope :last_week, -> { where("projekts.created_at >= ?", 7.days.ago) }

  scope :sort_by_individual_list, -> {
    individual_list
  }

  scope :with_published_custom_page, -> {
    joins(:page)
      .where(site_customization_pages: { status: "published" })
  }

  def self.overview_page
    find_by(
      special_name: "projekt_overview_page",
      special: true
    )
  end

  def self.selectable_in_selector(controller_name, current_user)
    select do |projekt|
      projekt.all_parent_projekts.unshift(projekt).none? { |p| p.hidden_for?(current_user) } &&
      projekt.all_children_projekts.unshift(projekt).any? do |p|
        p.selectable_in_selector?(controller_name, current_user)
      end
    end
  end

  def published?
    page&.status == "published"
  end

  def update_page
    update_corresponding_page if name_changed?
    yield
  end

  def selectable_in_selector?(controller_name, user)
    return true if controller_name == "polls"
    return true if controller_name == "processes"
    return false if user.nil?

    user_has_admin_rights = user.administrator? || user.projekt_manager?

    if controller_name == "proposals"
      return false if proposals_selectable_by_admins_only? && !user_has_admin_rights

      proposal_phases.first.selectable_by?(user)
    elsif controller_name == "debates"
      return false if debates_selectable_by_admins_only? && !user_has_admin_rights

      debate_phases.first.selectable_by?(user)
    elsif controller_name == "processes"
      # return false if proposals_selectable_by_admins_only? && user.administrator.blank?
      legislation_phases.first.selectable_by?(user)
    end
  end

  def top_level?
    order_number.present? && parent.blank?
  end

  def activated?
    projekt_settings.
      find_by(projekt_settings: { key: "projekt_feature.main.activate" }).
      value.
      present?
  end

  def current?(timestamp = Time.zone.today)
    activated? &&
     (total_duration_start.blank? || total_duration_start <= timestamp) &&
     (total_duration_end.blank? || total_duration_end >= timestamp)
  end

  def expired?(timestamp = Time.zone.today)
    activated? &&
      total_duration_end.present? &&
      total_duration_end < timestamp
  end

  def debates_selectable_by_admins_only?
    projekt_settings.
      find_by(projekt_settings: { key: "projekt_feature.debates.only_admins_create_debates" }).
      value.
      present?
  end

  def proposals_selectable_by_admins_only?
    projekt_settings.
      find_by(projekt_settings: { key: "projekt_feature.proposals.only_admins_create_proposals" }).
      value.
      present?
  end

  def activated_children
    children.activated
  end

  def comments_allowed?(current_user)
    comment_phase.selectable_by?(current_user)
  end

  def calculate_level(counter = 1)
    return counter if parent.blank?

    parent.calculate_level(counter + 1)
  end

  def breadcrumb_trail_ids(breadcrumb_trail_ids = [])
    breadcrumb_trail_ids.unshift(id)

    parent.breadcrumb_trail_ids(breadcrumb_trail_ids) if parent.present?

    breadcrumb_trail_ids
  end

  def all_parent_ids(all_parent_ids = [])
    if parent.present?
      all_parent_ids.push(parent.id)
      parent.all_parent_ids(all_parent_ids)
    end

    all_parent_ids
  end

  def all_parent_projekts(all_parent_projekts = [])
    if parent.present?
      all_parent_projekts.push(parent)
      parent.all_parent_projekts(all_parent_projekts)
    end

    all_parent_projekts
  end

  def all_children_ids(all_children_ids = [])
    if children.any?
      children.each do |child|
        all_children_ids.push(child.id)
        child.all_children_ids(all_children_ids)
      end
    end

    all_children_ids
  end

  def all_children_projekts(all_children_projekts = [])
    if children.any?
      children.each do |child|
        all_children_projekts.push(child)
        child.all_children_projekts(all_children_projekts)
      end
    end

    all_children_projekts
  end

  def has_active_phase?(controller_name)
    case controller_name
    when "proposals"
      proposal_phase.current?
    when "debates"
      debate_phase.current?
    when "polls"
      false
    end
  end

  def top_parent
    return self if parent.blank?

    parent.top_parent
  end

  def siblings
    if parent.present?
      parent.children
    else
      Projekt.top_level
    end
  end

  def order_up
    set_order && return if order_number.blank?
    return if order_number == 1

    swap_order_numbers_up
    ensure_projekt_order_integrity
  end

  def order_down
    set_order && return if order_number.blank?
    return if order_number > siblings.maximum(:order_number)

    swap_order_numbers_down
    ensure_projekt_order_integrity
  end

  def self.ensure_order_integrity
    all.find_each do |projekt|
      projekt.send(:ensure_projekt_order_integrity)
    end
  end

  def create_default_settings
    ProjektSetting.defaults.each do |name, value|
      unless ProjektSetting.find_by(key: name, projekt_id: id)
        ProjektSetting.create!(key: name, value: value, projekt_id: id)
      end
    end
  end

  def self.ensure_projekts_phases
    all.find_each do |projekt|
      projekt.send(:ensure_projekt_phases)
    end
  end

  def title
    name
  end

  def question_list_enabled?
    ProjektSetting.find_by(projekt: self, key: "projekt_feature.questions.show_questions_list")&.enabled?
  end

  def map_layers_for_render
    unless map_layers.any?(&:base?)
      return map_layers.or(MapLayer.where(projekt: nil, base: true))
    end

    map_layers
  end

  def legislation_process
    legislation_processes.order(:updated_at).last
  end

  def overview_page?
    special? && (special_name == OVERVIEW_PAGE_NAME)
  end

  def name
    if overview_page?
      I18n.t("custom.projekts.overview_page.projekt_name")
    else
      super
    end
  end

  def name_for_resource_creation(resource)
    if overview_page?
      resource_name = resource.class.name.downcase

      I18n.t(
        "custom.projekts.overview_page.projekt_name_for_#{resource_name}",
        default: name
      )
    else
      page.title
    end
  end

  def all_ids_in_tree
    all_parent_ids + [id] + all_children_ids
  end

  def all_projekt_labels
    ProjektLabel.where(projekt_id: (all_parent_ids + [id]))
  end

  def all_projekt_labels_in_tree
    ProjektLabel.where(projekt_id: all_ids_in_tree)
  end

  def map_location_with_admin_shape
    map_location.show_admin_shape? ? map_location : nil
  end

  def visible_for?(user = nil)
    return true if individual_group_values.hard.empty?
    return false unless user.present?
    return true if user.administrator?

    (individual_group_values.hard.ids & user.individual_group_values.hard.ids).any?
  end

  def hidden_for?(user = nil)
    !visible_for?(user)
  end

  private

    def create_corresponding_page
      page = SiteCustomization::Page.new(title: name, slug: form_page_slug, projekt: self)

      if page.save
        self.page = page
      end
    end

    def update_corresponding_page
      page.update(title: name, slug: form_page_slug)
    end

    def form_page_slug
      clean_slug = name.downcase.gsub("ä", "ae").gsub("ö", "oe").gsub("ü", "ue").gsub("ß", "ss")
        .gsub(/[^a-z0-9\s]/, "").gsub(/\s+/, "-")
      pages_with_similar_slugs = SiteCustomization::Page.where("slug ~ ?", "^#{clean_slug}(-[0-9]+$|$)")
        .order(id: :asc)

      if pages_with_similar_slugs.any? && pages_with_similar_slugs.last.slug.match?(/-\d+$/)
        clean_slug + "-" + (pages_with_similar_slugs.last.slug.split("-")[-1].to_i + 1).to_s
      elsif pages_with_similar_slugs.any?
        clean_slug + "-2"
      else
        clean_slug
      end
    end

    def set_order
      return unless order_number.blank?

      if siblings.with_order_number.any? &&
          siblings.with_order_number.pluck(:order_number).first == 1 &&
          siblings.with_order_number.pluck(:order_number).each_cons(2).all? { |a, b| b == a + 1 }
        ordered_siblings_count = siblings.with_order_number.last.order_number
        update!(order_number: ordered_siblings_count + 1)
      elsif siblings.with_order_number.any?
        update!(order_number: 0)
        ensure_projekt_order_integrity
      else
        update!(order_number: 1)
      end
    end

    def ensure_projekt_phases
      projekt.debate_phases << ProjektPhase::DebatePhase.create if projekt.debate_phases.empty?
      projekt.proposal_phases << ProjektPhase::ProposalPhase.create if projekt.proposal_phases.empty?
      projekt.budget_phases << ProjektPhase::BudgetPhase.create if projekt.budget_phases.empty?
      projekt.comment_phases << ProjektPhase::CommentPhase.create if projekt.comment_phases.empty?
      projekt.question_phases << ProjektPhase::QuestionPhase.create if projekt.question_phases.empty?
      projekt.voting_phases << ProjektPhase::VotingPhase.create if projekt.voting_phases.empty?
      projekt.milestone_phases << ProjektPhase::MilestonePhase.create if projekt.milestone_phases.empty?
      projekt.projekt_notification_phases << ProjektPhase::ProjektNotificationPhase.create if projekt.projekt_notification_phases.empty?
      projekt.newsfeed_phases << ProjektPhase::NewsfeedPhase.create if projekt.newsfeed_phases.empty?
      projekt.event_phases << ProjektPhase::EventPhase.create if projekt.event_phases.empty?
      projekt.argument_phases << ProjektPhase::ArgumentPhase.create if projekt.argument_phases.empty?
      projekt.livestream_phases << ProjektPhase::LivestreamPhase.create if projekt.livestream_phases.empty?
      projekt.legislation_phases << ProjektPhase::LegislationPhase.create if projekt.legislation_phases.empty?
    end

    def swap_order_numbers_up
      if siblings.with_order_number.where("order_number < ?", order_number).any?
        preceding_sibling_order_number = siblings.with_order_number.where("order_number < ?", order_number)
          .last.order_number
        preceding_sibling = siblings.find_by(order_number: preceding_sibling_order_number)

        preceding_sibling.update!(order_number: order_number)
        update!(order_number: preceding_sibling_order_number)
      end
    end

    def swap_order_numbers_down
      if siblings.with_order_number.where("order_number > ?", order_number).any?
        following_sibling_order_number = siblings.with_order_number.where("order_number > ?", order_number)
          .first.order_number
        following_sibling = siblings.find_by(order_number: following_sibling_order_number)

        following_sibling.update!(order_number: order_number)
        update!(order_number: following_sibling_order_number)
      end
    end

    def ensure_projekt_order_integrity
      unless siblings.with_order_number.pluck(:order_number).first == 1 &&
          siblings.with_order_number.pluck(:order_number).each_cons(2).all? { |a, b| b == a + 1 }
        new_order = 1
        siblings.with_order_number.each do |projekt|
          projekt.update!(order_number: new_order)
          new_order += 1
        end
      end
    end

    def create_map_location
      unless map_location.present?
        MapLocation.create!(
          latitude: Setting["map.latitude"],
          longitude: Setting["map.longitude"],
          zoom: Setting["map.zoom"],
          projekt_id: id
        )
      end
    end

    def set_default_color
      self.color ||= "#004a83"
    end

    def touch_updated_at(geozone)
      touch if persisted?
    end
end
