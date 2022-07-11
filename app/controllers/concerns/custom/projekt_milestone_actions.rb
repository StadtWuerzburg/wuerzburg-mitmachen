module ProjektMilestoneActions
  extend ActiveSupport::Concern
  include Translatable
  include ImageAttributes
  include DocumentAttributes

  included do
    before_action :load_milestoneable, only: [:index, :new, :create, :edit, :update, :destroy]
    before_action :load_milestone, only: [:edit, :update, :destroy]
    before_action :load_statuses, only: [:index, :new, :create, :edit, :update]
    helper_method :milestoneable_path
  end

  def index
  end

  def new
    @milestone = @milestoneable.milestones.new

    render 'admin/projekts/edit/projekt_milestones/new'
  end

  def create
    @milestone = @milestoneable.milestones.new(milestone_params)

    if @milestone.save
      redirect_to namespaced_polymorphic_path(params[:namespace], @milestoneable, action: :edit) + "#tab-projekt-milestones", notice: t("admin.milestones.create.notice")
    else
      render 'admin/projekts/edit/projekt_milestones/new'
    end
  end

  def edit
    render 'admin/projekts/edit/projekt_milestones/edit'
  end

  def update
    if @milestone.update(milestone_params)
      redirect_to namespaced_polymorphic_path(params[:namespace], @milestoneable, action: :edit) + "#tab-projekt-milestones", notice: t("admin.milestones.update.notice")
    else
      render 'admin/projekts/edit/projekt_milestones/new'
    end
  end

  def destroy
    @milestone.destroy!

    namespace = params[:controller].split('/').first
    redirect_to namespaced_polymorphic_path(namespace, @milestoneable, action: :edit) + "#tab-projekt-milestones", notice: t("admin.milestones.delete.notice")
  end

  private

    def milestone_params
      attributes = [:publication_date, :status_id,
                    translation_params(Milestone),
                    image_attributes: image_attributes, documents_attributes: document_attributes]

      params.require(:milestone).permit(*attributes)
    end

    def load_milestoneable
      @milestoneable = milestoneable
    end

    def milestoneable
      Projekt.find(params[:projekt_id])
    end

    def load_milestone
      @milestone = @milestoneable.milestones.find(params[:id])
    end

    def load_statuses
      @statuses = Milestone::Status.all
    end

    def milestoneable_path
      namespace = params[:controller].split('/').first
      namespaced_polymorphic_path(namespace, @milestoneable, action: :edit) + "#tab-projekt-milestones"
    end
end
